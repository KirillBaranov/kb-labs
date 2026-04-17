FROM mcr.microsoft.com/playwright:v1.52.0-noble

RUN npm install -g pnpm@9

WORKDIR /tests
COPY package.json ./
RUN pnpm install

COPY . .

CMD ["pnpm", "test"]
