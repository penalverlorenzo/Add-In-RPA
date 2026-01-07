FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npx playwright install --with-deps

COPY . .

ENV PORT=3001
EXPOSE 3001

CMD ["node", "index.js"]
