# ---- development stage ----
FROM node:22-alpine AS development

WORKDIR /app
COPY package*.json ./
RUN NODE_ENV=development npm install
COPY . .

EXPOSE 80
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "80"]

# ---- build stage ----
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN NODE_ENV=development npm install
COPY . .

ARG VITE_FEATURE_FEEDBACK_BUTTON=false
ENV VITE_FEATURE_FEEDBACK_BUTTON=${VITE_FEATURE_FEEDBACK_BUTTON}

RUN npx vite build

# ---- production stage ----
FROM nginx:1.25-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
