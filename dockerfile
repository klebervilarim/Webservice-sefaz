RUN apt-get update \
 && apt-get install -y libxml2-utils openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
