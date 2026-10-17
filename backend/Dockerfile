FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
# RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .

CMD ["tail", "-f", "/dev/null"]
