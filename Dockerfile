FROM node:16-alpine

RUN apk add --no-cache --update \
  make \
  g++ \
  git \
  bash \
  curl

# Create app directory
WORKDIR /server

# Install app dependencies
COPY package.json ./
COPY .gitmodules ./
COPY /deps ./deps
RUN git init
RUN git submodule init 
RUN git submodule update --recursive --remote

ARG TS_VERSION=4.4.3
RUN npm install
RUN npm install typescript@${TS_VERSION}


# Bundle app source
COPY . .

# Build server
RUN npm run build

# Expose listen port
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
