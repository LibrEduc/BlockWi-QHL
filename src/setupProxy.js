/**
 * Proxy de développement : les assets µcBlockly (bundle.js, chunks, workers)
 * sont servis depuis le CDN sous l’origine localhost pour éviter
 * SecurityError (pushState) et erreurs de workers cross-origin.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

const UCBLOCKLY_CDN = 'https://a-s-t-u-c-e.github.io';

module.exports = function (app) {
  app.use(
    '/ucblockly',
    createProxyMiddleware({
      target: UCBLOCKLY_CDN,
      changeOrigin: true,
      pathRewrite: { '^/ucblockly': '/ucBlockly/dist/bundle' },
      bypass(req) {
        const url = req.originalUrl || req.url || '';
        if (url === '/ucblockly' || url === '/ucblockly/' || url.startsWith('/ucblockly/index.html')) {
          return true;
        }
        return null;
      },
    })
  );
};
