module.exports = {
  apps: [{
    name: 'messenger-backend',
    script: 'index.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PUBLIC_HTTPS_URL: 'https://svyaz-plusplus.com',
      MEDIASOUP_ANNOUNCED_IP: '95.215.108.56',
      TURN_HOST: '95.215.108.56:3478',
      TURN_USER: 'gossvyaz',
      TURN_PASS: 'ghjcnj123',
      TURN2_HOST: '165.232.69.82:3478',
      TURN2_USER: 'gossvyaz',
      TURN2_PASS: 'ghjcnj123',
    },
    error_file: 'err.log',
    out_file: 'out.log',
    merge_logs: true,
  }],
};
