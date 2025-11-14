// api_gateway/src/handlers/status.handler.js
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Update notification status
 * POST /api/v1/{notification_preference}/status/
 * 
 * Body:
 * {
 *   notification_id: string,
 *   status: "delivered" | "pending" | "failed",
 *   timestamp?: string (ISO datetime),
 *   error?: string
 * }
 */
async function updateNotificationStatus(request, reply) {
    const { notification_preference } = request.params;
    const { notification_id, status, timestamp, error } = request.body;
    const redis = request.redis;
    const log = request.log;

    // Validate notification_preference
    if (notification_preference !== 'email' && notification_preference !== 'push') {
        return reply.code(400).send(errorResponse(
            'Bad Request',
            'Invalid notification_preference. Must be "email" or "push".'
        ));
    }

    // Validate status enum
    const validStatuses = ['delivered', 'pending', 'failed'];
    if (!status || !validStatuses.includes(status)) {
        return reply.code(400).send(errorResponse(
            'Bad Request',
            `Invalid status. Must be one of: ${validStatuses.join(', ')}.`
        ));
    }

    // Validate notification_id
    if (!notification_id) {
        return reply.code(400).send(errorResponse(
            'Bad Request',
            'notification_id is required.'
        ));
    }

    try {
        const notificationStatusKey = `notification:${notification_id}`;
        
        // Get existing status data
        const existingStatusData = await redis.get(notificationStatusKey);
        if (!existingStatusData) {
            log.warn({ notification_id }, 'Notification status not found in Redis.');
            return reply.code(404).send(errorResponse(
                'Not Found',
                'Notification status not found.'
            ));
        }

        const existingStatus = JSON.parse(existingStatusData);
        
        const updatedStatus = {
            ...existingStatus,
            status: status.toUpperCase(), 
            timestamp: timestamp || new Date().toISOString(),
            ...(error && { error }),
            updated_at: new Date().toISOString(),
        };

        // Store updated status in Redis
        await redis.set(notificationStatusKey, JSON.stringify(updatedStatus), 'EX', 3600);

        log.info({
            notification_id,
            notification_preference,
            status,
            previous_status: existingStatus.status
        }, 'Notification status updated');

        return reply.code(200).send(successResponse(
            updatedStatus,
            'Notification status updated successfully.'
        ));

    } catch (error) {
        log.error({ error, notification_id, notification_preference }, 'Error updating notification status.');
        return reply.code(500).send(errorResponse(
            'Internal Server Error',
            'Failed to update notification status.'
        ));
    }
}

module.exports = { updateNotificationStatus };

