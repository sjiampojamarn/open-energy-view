ARG BUILD_FROM
FROM ${BUILD_FROM} as BUILD_IMAGE

RUN apt-get update \
  && apt-get install -y python3-pip python3-dev erlang rabbitmq-server curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
  
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
 
WORKDIR /open-energy-view
COPY . .

RUN pip3 install -r requirements.txt

WORKDIR /open-energy-view/open_energy_view/frontend
RUN nvm use 10 && npm install && npm run build

EXPOSE 5000
