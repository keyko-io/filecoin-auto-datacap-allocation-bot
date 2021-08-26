FROM node:12-alpine

RUN apk add --no-cache --update \
  python \
  make \
  g++ \
  git \
  bash \
  curl

# Create app directory
WORKDIR /server

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build server
RUN npm run build

# Expose listen port
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
