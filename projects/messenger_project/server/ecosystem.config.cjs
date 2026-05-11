module.exports = {
  apps: [{
    name: 'messenger-backend',
    script: 'index.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PUBLIC_HTTPS_URL: process.env.PUBLIC_HTTPS_URL || 'https://svyaz-plusplus.com',
      MEDIASOUP_ANNOUNCED_IP: process.env.MEDIASOUP_ANNOUNCED_IP || '',
      TURN_HOST: process.env.TURN_HOST || '',
      TURN_USER: process.env.TURN_USER || '',
      TURN_PASS: process.env.TURN_PASS || '',
      TURN2_HOST: process.env.TURN2_HOST || '',
      TURN2_USER: process.env.TURN2_USER || '',
      TURN2_PASS: process.env.TURN2_PASS || '',
    },
    error_file: 'err.log',
    out_file: 'out.log',
    merge_logs: true,
  }],
};
