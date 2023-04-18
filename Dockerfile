FROM node:16-alpine


# Create app directory
WORKDIR /server

# Install app dependencies
COPY package.json ./
RUN npm install

# Bundle app source
COPY . .

# Build server
RUN npm run build

# Expose listen port
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]
