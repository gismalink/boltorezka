FROM node:22-alpine AS web-build

WORKDIR /web

COPY --from=web package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

ARG VITE_RTC_ICE_SERVERS_JSON
ARG VITE_RTC_ICE_TRANSPORT_POLICY
ARG VITE_RTC_RECONNECT_MAX_ATTEMPTS
ARG VITE_RTC_RECONNECT_BASE_DELAY_MS
ARG VITE_RTC_RECONNECT_MAX_DELAY_MS
ARG VITE_APP_VERSION
ARG VITE_APP_BUILD_DATE
ARG VITE_AUTH_COOKIE_MODE
ARG VITE_CHAT_OBJECT_STORAGE_WRITE

ENV VITE_RTC_ICE_SERVERS_JSON=${VITE_RTC_ICE_SERVERS_JSON}
ENV VITE_RTC_ICE_TRANSPORT_POLICY=${VITE_RTC_ICE_TRANSPORT_POLICY}
ENV VITE_RTC_RECONNECT_MAX_ATTEMPTS=${VITE_RTC_RECONNECT_MAX_ATTEMPTS}
ENV VITE_RTC_RECONNECT_BASE_DELAY_MS=${VITE_RTC_RECONNECT_BASE_DELAY_MS}
ENV VITE_RTC_RECONNECT_MAX_DELAY_MS=${VITE_RTC_RECONNECT_MAX_DELAY_MS}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_APP_BUILD_DATE=${VITE_APP_BUILD_DATE}
ENV VITE_AUTH_COOKIE_MODE=${VITE_AUTH_COOKIE_MODE}
ENV VITE_CHAT_OBJECT_STORAGE_WRITE=${VITE_CHAT_OBJECT_STORAGE_WRITE}

COPY --from=web . ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY src ./src
COPY migrations ./migrations
RUN mkdir -p public
COPY --from=web-build /web/dist ./public

EXPOSE 8080

CMD ["npm", "run", "start"]
