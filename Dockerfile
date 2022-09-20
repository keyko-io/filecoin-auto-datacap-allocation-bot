FROM node:12-alpine

RUN apk add --no-cache --update \
  make \
  python3 \
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
RUN npm install


# Bundle app source
COPY . .

# Build server
RUN npm run build

# Expose listen port
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
