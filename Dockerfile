ARG BUILD_FROM
FROM ${BUILD_FROM} as BUILD_IMAGE

RUN apt-get update \
  && apt-get install -y python3-pip python3-venv python3-dev erlang rabbitmq-server curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
 
WORKDIR /open-energy-view
COPY . .

RUN pip3 install -r requirements.txt
