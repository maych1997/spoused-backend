# Use a base image with Node.js 23
FROM node:23

# Install Redis server
RUN apt-get update && apt-get install -y redis-server

# Set the working directory inside the container
WORKDIR x`

# Copy the application code into the container
COPY . .

# Install app dependencies
RUN npm install

# Expose the port your app runs on (e.g., 4000)
EXPOSE 4000

# Command to start Redis and then your app
CMD redis-server --daemonize yes && npm start
