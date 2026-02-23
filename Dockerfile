# Usamos a imagem oficial do Node 20 (Debian Bullseye para melhor compatibilidade com OpenSCAD)
FROM node:20-bullseye-slim

# Instala o OpenSCAD e as fontes para renderizar o texto corretamente
RUN apt-get update && apt-get install -y \
    openscad \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copia os teus templates STL e o código
COPY . .

# Garante que a pasta temp existe para os processos do OpenSCAD
RUN mkdir -p temp

EXPOSE 10000

CMD ["node", "server.js"]