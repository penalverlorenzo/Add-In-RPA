/**
 * Image Hash Service - Perceptual Image Hashing and Comparison
 * Detects similar/duplicate images to avoid processing them multiple times
 * Uses sharp library (pure Node.js, no system dependencies)
 */

import { createHash } from 'crypto';

let sharp = null;
let sharpLoaded = false;

/**
 * Lazy load sharp library
 * @returns {Promise<Object|null>} sharp module or null if not available
 */
async function loadSharp() {
    if (sharpLoaded) {
        return sharp;
    }
    
    try {
        sharp = await import('sharp');
        sharpLoaded = true;
        console.log('✅ sharp library loaded successfully');
        return sharp;
    } catch (error) {
        sharpLoaded = true; // Mark as loaded to avoid repeated attempts
        console.warn('⚠️ sharp library not found. Using fallback hash method.');
        console.warn('   Install with: npm install sharp');
        return null;
    }
}

/**
 * Calculate average hash (aHash) - a simple perceptual hash algorithm
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} imageName - Image name for logging (optional)
 * @returns {Promise<string>} Hexadecimal hash string (64 characters for 8x8 image)
 */
async function calculateAverageHash(imageBuffer, imageName = 'unknown') {
    const sharpModule = await loadSharp();
    
    if (!sharpModule) {
        // Fallback: Use MD5 hash (only detects identical images, not similar ones)
        console.warn(`   ⚠️ [${imageName}] Using MD5 fallback hash (only detects identical images)`);
        const md5Hash = createHash('md5').update(imageBuffer).digest('hex');
        console.log(`   📝 [${imageName}] MD5 hash calculated: ${md5Hash.substring(0, 16)}...`);
        return md5Hash;
    }

    try {
        console.log(`   🔄 [${imageName}] Starting aHash calculation (resizing to 8x8)...`);
        const startTime = Date.now();
        
        // Resize image to 8x8 (64 pixels total)
        const resized = await sharpModule.default(imageBuffer)
            .resize(8, 8, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer();

        console.log(`   ✅ [${imageName}] Image resized to 8x8 (${resized.length} pixels)`);

        // Calculate average pixel value
        let sum = 0;
        for (let i = 0; i < resized.length; i++) {
            sum += resized[i];
        }
        const average = sum / resized.length;
        console.log(`   📊 [${imageName}] Average pixel value: ${average.toFixed(2)}`);

        // Generate hash: 1 if pixel > average, 0 otherwise
        let hash = '';
        for (let i = 0; i < resized.length; i++) {
            hash += resized[i] > average ? '1' : '0';
        }
        console.log(`   🔢 [${imageName}] Binary hash generated (${hash.length} bits)`);

        // Convert binary string to hexadecimal
        let hexHash = '';
        for (let i = 0; i < hash.length; i += 4) {
            const bin = hash.substr(i, 4);
            hexHash += parseInt(bin, 2).toString(16);
        }

        const elapsed = Date.now() - startTime;
        console.log(`   ✅ [${imageName}] aHash calculated in ${elapsed}ms: ${hexHash.substring(0, 16)}...`);

        return hexHash;
    } catch (error) {
        console.error(`   ❌ [${imageName}] Error calculating average hash:`, error.message);
        // Fallback to MD5
        const md5Hash = createHash('md5').update(imageBuffer).digest('hex');
        console.log(`   📝 [${imageName}] Fallback MD5 hash: ${md5Hash.substring(0, 16)}...`);
        return md5Hash;
    }
}

/**
 * Calculate difference hash (dHash) - more robust than aHash
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} imageName - Image name for logging (optional)
 * @returns {Promise<string>} Hexadecimal hash string
 */
async function calculateDifferenceHash(imageBuffer, imageName = 'unknown') {
    const sharpModule = await loadSharp();
    
    if (!sharpModule) {
        // Fallback: Use MD5 hash
        console.warn(`   ⚠️ [${imageName}] Using MD5 fallback hash (only detects identical images)`);
        const md5Hash = createHash('md5').update(imageBuffer).digest('hex');
        console.log(`   📝 [${imageName}] MD5 hash calculated: ${md5Hash.substring(0, 16)}...`);
        return md5Hash;
    }

    try {
        console.log(`   🔄 [${imageName}] Starting dHash calculation (resizing to 9x8)...`);
        const startTime = Date.now();
        
        // Resize to 9x8 (9 width to compare 8 differences)
        const resized = await sharpModule.default(imageBuffer)
            .resize(9, 8, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer();

        console.log(`   ✅ [${imageName}] Image resized to 9x8 (${resized.length} pixels)`);

        // Generate hash: compare adjacent pixels horizontally
        let hash = '';
        let comparisons = 0;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const left = resized[row * 9 + col];
                const right = resized[row * 9 + col + 1];
                hash += left > right ? '1' : '0';
                comparisons++;
            }
        }
        console.log(`   🔢 [${imageName}] Binary hash generated (${hash.length} bits, ${comparisons} pixel comparisons)`);

        // Convert binary string to hexadecimal
        let hexHash = '';
        for (let i = 0; i < hash.length; i += 4) {
            const bin = hash.substr(i, 4);
            hexHash += parseInt(bin, 2).toString(16);
        }

        const elapsed = Date.now() - startTime;
        console.log(`   ✅ [${imageName}] dHash calculated in ${elapsed}ms: ${hexHash.substring(0, 16)}...`);

        return hexHash;
    } catch (error) {
        console.error(`   ❌ [${imageName}] Error calculating difference hash:`, error.message);
        // Fallback to MD5
        const md5Hash = createHash('md5').update(imageBuffer).digest('hex');
        console.log(`   📝 [${imageName}] Fallback MD5 hash: ${md5Hash.substring(0, 16)}...`);
        return md5Hash;
    }
}

/**
 * Calculate perceptual hash of an image
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} algorithm - Hash algorithm: 'aHash' (average), 'dHash' (difference) (default: 'dHash')
 * @param {string} imageName - Image name for logging (optional)
 * @returns {Promise<string>} Hexadecimal hash string
 */
async function calculatePerceptualHash(imageBuffer, algorithm = 'dHash', imageName = 'unknown') {
    console.log(`   🎯 [${imageName}] Calculating ${algorithm} perceptual hash...`);
    if (algorithm === 'aHash') {
        return await calculateAverageHash(imageBuffer, imageName);
    } else {
        // Default to dHash (more robust)
        return await calculateDifferenceHash(imageBuffer, imageName);
    }
}

/**
 * Calculate Hamming distance between two hash strings
 * @param {string} hash1 - First hash (hexadecimal string)
 * @param {string} hash2 - Second hash (hexadecimal string)
 * @param {string} image1Name - First image name for logging (optional)
 * @param {string} image2Name - Second image name for logging (optional)
 * @returns {number} Hamming distance (0 = identical, higher = more different)
 */
function calculateHammingDistance(hash1, hash2, image1Name = 'image1', image2Name = 'image2') {
    if (!hash1 || !hash2) {
        console.log(`   ⚠️ [${image1Name} vs ${image2Name}] Cannot calculate distance: one or both hashes are empty`);
        return Infinity;
    }
    if (hash1.length !== hash2.length) {
        console.log(`   ⚠️ [${image1Name} vs ${image2Name}] Hash length mismatch: ${hash1.length} vs ${hash2.length}`);
        return Infinity;
    }

    console.log(`   🔍 [${image1Name} vs ${image2Name}] Calculating Hamming distance...`);
    
    // Convert hex strings to binary and calculate Hamming distance
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        // Convert each hex character to 4-bit binary
        const hex1 = parseInt(hash1[i], 16);
        const hex2 = parseInt(hash2[i], 16);
        // XOR to find differing bits
        const xor = hex1 ^ hex2;
        // Count set bits in XOR result (Hamming distance for this hex digit)
        distance += xor.toString(2).split('1').length - 1;
    }
    
    console.log(`   📏 [${image1Name} vs ${image2Name}] Hamming distance: ${distance} bits`);
    return distance;
}

/**
 * Calculate similarity percentage between two hashes
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @param {string} image1Name - First image name for logging (optional)
 * @param {string} image2Name - Second image name for logging (optional)
 * @returns {number} Similarity percentage (0-100, where 100 = identical)
 */
function calculateSimilarity(hash1, hash2, image1Name = 'image1', image2Name = 'image2') {
    const distance = calculateHammingDistance(hash1, hash2, image1Name, image2Name);
    if (distance === Infinity) {
        console.log(`   ❌ [${image1Name} vs ${image2Name}] Cannot calculate similarity: invalid hashes`);
        return 0;
    }
    
    const maxDistance = hash1.length * 4; // Maximum possible distance (all bits different)
    const similarity = ((maxDistance - distance) / maxDistance) * 100;
    const clampedSimilarity = Math.max(0, Math.min(100, similarity)); // Clamp between 0 and 100
    
    console.log(`   📊 [${image1Name} vs ${image2Name}] Similarity: ${clampedSimilarity.toFixed(2)}% (distance: ${distance}/${maxDistance} bits)`);
    
    return clampedSimilarity;
}

/**
 * Check if two images are similar based on their hashes
 * @param {string} hash1 - First image hash
 * @param {string} hash2 - Second image hash
 * @param {number} similarityThreshold - Minimum similarity percentage to consider images similar (default: 85)
 * @param {string} image1Name - First image name for logging (optional)
 * @param {string} image2Name - Second image name for logging (optional)
 * @returns {boolean} True if images are similar
 */
function areImagesSimilar(hash1, hash2, similarityThreshold = 85, image1Name = 'image1', image2Name = 'image2') {
    if (!hash1 || !hash2) {
        console.log(`   ⚠️ [${image1Name} vs ${image2Name}] Cannot compare: one or both hashes are empty`);
        return false;
    }
    const similarity = calculateSimilarity(hash1, hash2, image1Name, image2Name);
    const isSimilar = similarity >= similarityThreshold;
    console.log(`   ${isSimilar ? '✅' : '❌'} [${image1Name} vs ${image2Name}] ${isSimilar ? 'SIMILAR' : 'DIFFERENT'} (${similarity.toFixed(2)}% >= ${similarityThreshold}% threshold)`);
    return isSimilar;
}

/**
 * Filter out similar images from an array
 * @param {Array} images - Array of image objects with buffer property
 * @param {number} similarityThreshold - Minimum similarity percentage to consider images similar (default: 85)
 * @returns {Promise<Array>} Filtered array of unique images
 */
async function filterSimilarImages(images, similarityThreshold = 85) {
    if (!images || images.length === 0) {
        console.log('🔍 [Image Hash] No images to filter');
        return [];
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 [Image Hash] Starting image similarity filtering`);
    console.log(`   📊 Total images received: ${images.length}`);
    console.log(`   🎯 Similarity threshold: ${similarityThreshold}%`);
    console.log(`   📏 Algorithm: dHash (Difference Hash)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const uniqueImages = [];
    const startTime = Date.now();
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const imageName = image.originalname || `image-${i + 1}`;
        const imageSize = image.size ? `${(image.size / 1024).toFixed(2)} KB` : 'unknown size';
        
        console.log(`\n📸 [${i + 1}/${images.length}] Processing: ${imageName} (${imageSize})`);
        
        try {
            // Calculate hash for current image (using dHash for better accuracy)
            const hashStartTime = Date.now();
            const hash = await calculatePerceptualHash(image.buffer, 'dHash', imageName);
            const hashElapsed = Date.now() - hashStartTime;
            console.log(`   ⏱️  Hash calculation completed in ${hashElapsed}ms`);

            // Check if this image is similar to any already processed image
            let isSimilar = false;
            let similarToIndex = -1;
            let maxSimilarity = 0;
            
            if (uniqueImages.length > 0) {
                console.log(`   🔍 Comparing with ${uniqueImages.length} previously processed image(s)...`);
            }
            
            for (let j = 0; j < uniqueImages.length; j++) {
                const existingHash = uniqueImages[j].hash;
                const existingImageName = uniqueImages[j].image.originalname || `image-${uniqueImages[j].index + 1}`;
                
                if (areImagesSimilar(hash, existingHash, similarityThreshold, imageName, existingImageName)) {
                    const similarity = calculateSimilarity(hash, existingHash, imageName, existingImageName);
                    if (similarity > maxSimilarity) {
                        maxSimilarity = similarity;
                        similarToIndex = uniqueImages[j].index;
                    }
                    isSimilar = true;
                    break;
                }
            }

            if (isSimilar) {
                skippedCount++;
                const similarImageName = uniqueImages.find(u => u.index === similarToIndex)?.image.originalname || `image-${similarToIndex + 1}`;
                console.log(`   ⚠️  [${imageName}] SKIPPED - ${maxSimilarity.toFixed(2)}% similar to ${similarImageName}`);
            } else {
                uniqueImages.push({ image, hash, index: i });
                console.log(`   ✅ [${imageName}] UNIQUE - Added to processing queue`);
            }
        } catch (error) {
            errorCount++;
            console.error(`   ❌ [${imageName}] ERROR processing image:`, error.message);
            console.error(`   📋 Error stack:`, error.stack);
            // Include image anyway if hash calculation fails
            uniqueImages.push({ image, hash: null, index: i });
            console.log(`   ⚠️  [${imageName}] Added to queue despite error (will be processed)`);
        }
    }

    const totalElapsed = Date.now() - startTime;
    const processedCount = uniqueImages.length;
    const savedCount = images.length - processedCount;
    const savedPercentage = ((savedCount / images.length) * 100).toFixed(1);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ [Image Hash] Filtering completed in ${totalElapsed}ms`);
    console.log(`   📊 Summary:`);
    console.log(`      • Total images: ${images.length}`);
    console.log(`      • Unique images: ${processedCount}`);
    console.log(`      • Skipped (similar): ${skippedCount}`);
    console.log(`      • Errors: ${errorCount}`);
    console.log(`      • Savings: ${savedCount} images (${savedPercentage}%)`);
    console.log(`   ⏱️  Average time per image: ${(totalElapsed / images.length).toFixed(0)}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return uniqueImages.map(item => item.image);
}

/**
 * Get hash for a single image
 * @param {Object} image - Image object with buffer property
 * @param {string} algorithm - Hash algorithm: 'aHash' or 'dHash' (default: 'dHash')
 * @returns {Promise<string>} Image hash
 */
async function getImageHash(image, algorithm = 'dHash') {
    if (!image || !image.buffer) {
        throw new Error('Image object must have a buffer property');
    }
    const imageName = image.originalname || 'single-image';
    console.log(`🔍 [Image Hash] Calculating hash for single image: ${imageName}`);
    const hash = await calculatePerceptualHash(image.buffer, algorithm, imageName);
    console.log(`✅ [Image Hash] Hash calculated for ${imageName}: ${hash.substring(0, 16)}...`);
    return hash;
}

export {
    calculatePerceptualHash,
    calculateHammingDistance,
    calculateSimilarity,
    areImagesSimilar,
    filterSimilarImages,
    getImageHash
};
