FROM node:22-alpine AS web-build

WORKDIR /web

COPY --from=web package.json package-lock.json* ./
RUN npm install

COPY --from=web . ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src
RUN mkdir -p public
COPY --from=web-build /web/dist ./public

EXPOSE 8080

CMD ["npm", "run", "start"]
