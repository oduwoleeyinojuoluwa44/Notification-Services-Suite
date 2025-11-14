const fastify = require('fastify');
const crypto = require('crypto');
const config = require('../config/config');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const loggerPlugin = require('../middlewares/logger.middleware');
const correlationIdPlugin = require('../middlewares/correlation.middleware');
const authPlugin = require('../middlewares/auth.middleware');
const { connectRabbitMQ } = require('../services/rabbitmq.service');
const rateLimit = require('@fastify/rate-limit');
const Redis = require('ioredis');
const routes = require('./routes/index');

const buildServer = () => {
    const app = fastify({
        logger: {
            level: config.LOG_LEVEL,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            },
        },
        schemaErrorFormatter: (errors, dataVar) => {
            const errorMessage = errors.map(err => err.message).join(', ');
            return new Error(errorMessage);
        },
        genReqId: (req) => req.headers[config.CORRELATION_ID_HEADER] || crypto.randomUUID(),
    });

    const redis = new Redis(config.REDIS_URL);
    
    app.addHook('onRequest', async (request, reply) => {
        request.redis = redis;
    });

    app.addHook('onClose', async (instance) => {
        await instance.redis.quit();
        instance.log.info('Redis client disconnected.');
    });

    app.register(cors, {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', config.CORRELATION_ID_HEADER],
    });
    app.register(helmet);

    app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        errorResponseBuilder: (request, context) => {
            return {
                success: false,
                message: 'Too many requests',
                error: 'Rate Limit Exceeded',
                meta: {
                    limit: context.max,
                    current: context.current,
                    remaining: context.ttl,
                },
            };
        },
    });

    app.register(correlationIdPlugin);
    app.register(loggerPlugin);
    app.register(authPlugin);

    app.register(require('./routes/index'));

    app.get('/api/v1/health', async (request, reply) => {
        reply.send({ status: 'ok' });
    });

    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        const { errorResponse } = require('./utils/response');
        const statusCode = error.statusCode || 500;
        const errorMessage = error.validation ? 'Validation Error' : error.message;
        reply.status(statusCode).send(errorResponse(errorMessage, error.message));
    });

    return app;
};

const startServer = async () => {
    const app = buildServer();

    try {
        await connectRabbitMQ(); // Connect to RabbitMQ before starting the server
        await app.listen({ port: config.PORT, host: '0.0.0.0' });
        app.log.info(`API Gateway listening on ${app.server.address().port}`);
    } catch (err) {
        app.log.error(`Failed to start API Gateway: ${err.message}`);
        process.exit(1);
    }
};

if (require.main === module) {
    startServer();
}

module.exports = { buildServer, startServer };
