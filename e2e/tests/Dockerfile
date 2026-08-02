FROM mcr.microsoft.com/playwright:v1.52.0-noble

RUN npm install -g pnpm@11.4.0

WORKDIR /tests
COPY package.json ./
RUN pnpm install && npx playwright install chromium

COPY . .

CMD ["pnpm", "test"]
