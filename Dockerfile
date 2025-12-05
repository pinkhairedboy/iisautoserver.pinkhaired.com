# Use Node.js LTS (Long Term Support) version
FROM node:18-alpine

# Install Java Runtime Environment for potential testing
# (Optional: remove if not needed)
RUN apk add --no-cache openjdk8-jre

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY public/ ./public/

# Create storage directory
RUN mkdir -p /app/storage/temp

# Expose port
EXPOSE 3003

# Set environment variables
ENV NODE_ENV=production \
    PORT=3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "src/index.js"]
