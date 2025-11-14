const { sendNotification } = require('../handlers/notification.handler');
const { updateNotificationStatus } = require('../handlers/status.handler');

async function notificationRoutes(fastify, options) {
    const sendNotificationSchema = {
        body: {
            type: 'object',
            required: ['user_id', 'template_code', 'notification_type', 'variables'],
            properties: {
                user_id: { type: 'string' },
                template_code: { type: 'string' },
                notification_type: { type: 'string', enum: ['email', 'push'] },
                variables: { type: 'object' },
                request_id: { type: 'string' },
                priority: { type: 'integer' },
                metadata: { type: 'object' },
            },
        },
    };

    const updateStatusSchema = {
        body: {
            type: 'object',
            required: ['notification_id', 'status'],
            properties: {
                notification_id: { type: 'string' },
                status: { type: 'string', enum: ['delivered', 'pending', 'failed'] },
                timestamp: { type: 'string', format: 'date-time' },
                error: { type: 'string' },
            },
        },
    };

    fastify.post('/send', { schema: sendNotificationSchema, handler: sendNotification });

    fastify.get('/:notification_id/status', async (request, reply) => {
        const { notification_id } = request.params;
        const redis = request.redis;
        const log = request.log;
        const { successResponse, errorResponse } = require('../utils/response');

        try {
            const statusData = await redis.get(`notification:${notification_id}`);
            if (!statusData) {
                log.warn({ notification_id }, 'Notification status not found in Redis.');
                return reply.code(404).send(errorResponse('Not Found', 'Notification status not found.'));
            }
            reply.code(200).send(successResponse(JSON.parse(statusData), 'Notification status retrieved successfully.'));
        } catch (error) {
            log.error({ error, notification_id }, 'Error retrieving notification status from Redis.');
            reply.code(500).send(errorResponse('Internal Server Error', 'Failed to retrieve notification status.'));
        }
    });
}

// Export a separate function for status update routes
async function statusRoutes(fastify, options) {
    const updateStatusSchema = {
        body: {
            type: 'object',
            required: ['notification_id', 'status'],
            properties: {
                notification_id: { type: 'string' },
                status: { type: 'string', enum: ['delivered', 'pending', 'failed'] },
                timestamp: { type: 'string', format: 'date-time' },
                error: { type: 'string' },
            },
        },
    };

    // POST /api/v1/{notification_preference}/status/
    fastify.post('/:notification_preference/status/', { 
        schema: updateStatusSchema, 
        handler: updateNotificationStatus 
    });
}

module.exports = { notificationRoutes, statusRoutes };
