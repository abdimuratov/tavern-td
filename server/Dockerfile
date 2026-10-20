# The Relay for Versus (docs/adr/0006-a-relay-server-on-render.md). Node runs
# the TypeScript as it is, and ws is the only dependency, pinned in
# package.json and with none of its own. Render sets $PORT.
FROM node:26.3.1-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts
COPY src ./src
ENV NODE_ENV=production
USER node
CMD ["node", "src/main.ts"]
