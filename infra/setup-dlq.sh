#!/bin/bash
# Script to set up Dead Letter Queue (DLQ) for RabbitMQ

echo "Setting up Dead Letter Queue for RabbitMQ..."

# Wait for RabbitMQ to be ready
sleep 5

# Create Dead Letter Exchange
docker exec infra-rabbitmq-1 rabbitmqadmin -u user -p password declare exchange name=notifications.dlx type=direct durable=true

# Create Dead Letter Queue for email
docker exec infra-rabbitmq-1 rabbitmqadmin -u user -p password declare queue name=email_queue.dlq durable=true

# Bind DLQ to DLX
docker exec infra-rabbitmq-1 rabbitmqadmin -u user -p password declare binding source=notifications.dlx destination=email_queue.dlq routing_key=email.failed

# Create Dead Letter Queue for push
docker exec infra-rabbitmq-1 rabbitmqadmin -u user -p password declare queue name=push_queue.dlq durable=true

# Bind push DLQ to DLX
docker exec infra-rabbitmq-1 rabbitmqadmin -u user -p password declare binding source=notifications.dlx destination=push_queue.dlq routing_key=push.failed

echo "Dead Letter Queue setup complete!"
echo ""
echo "DLQ Configuration:"
echo "  - Exchange: notifications.dlx"
echo "  - Email DLQ: email_queue.dlq (routing key: email.failed)"
echo "  - Push DLQ: push_queue.dlq (routing key: push.failed)"
echo ""
echo "View DLQ messages at: http://localhost:15672"

