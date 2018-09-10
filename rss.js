var libQ = require('kew');
var zlib = require('zlib');
var FeedParser = require('feedparser');
var request = require('request');
var _ = require('lodash');

function maybeDecompress (res, encoding) {
  var decompress;
  if (encoding.match(/\bdeflate\b/)) {
    decompress = zlib.createInflate();
  } else if (encoding.match(/\bgzip\b/)) {
    decompress = zlib.createGunzip();
  }
  return decompress ? res.pipe(decompress) : res;
}

function getParams(str) {
  var params = str.split(';').reduce(function (params, param) {
    var parts = param.split('=').map(function (part) { return part.trim(); });
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});
  return params;
}

function queryFeed(url, options) {
  if (!url) {
    return libQ.defer().fail('no URL provided');
  }

  var maxItems = options.maxItems || 300;
  var resolved = false;
  var defer = libQ.defer();
  var req = request(url, {timeout: options.timeout || 1000})
  for (var h in _.get(options, 'headers', {})) {
    req.setHeader(h, options.headers[h]);
  }

  var feedparser = new FeedParser();

  req.on('error', error => {
    feedparser.emit('error', new Error(error));
  });

  req.on('response', function (res) {
    if (res.statusCode !== 200) {
      return feedparser.emit('error', new Error('Bad status code'));
    }
    var encoding = res.headers['content-encoding'] || 'identity';
    var charset = getParams(res.headers['content-type'] || '').charset;
    res = maybeDecompress(res, encoding);
    res.pipe(feedparser);
  });

  feedparser.on('error', error => {
    if (!resolved) {
      defer.reject(error);
      resolved = true;
    }
  });

  var channel = {};
  feedparser.on('meta', function (meta) {
    channel.imageUrl = _.get(meta, 'image.url');
    if (!channel.imageUrl) {
      channel.imageUrl = _.get(meta, 'itunes:image.@.href');
    }
    channel.title = meta.title;
  });

  var items = [];
  feedparser.on('readable', function () {
    if (resolved) {
      return;
    }

    var stream = this;
    var meta = this.meta;

    var item;
    while (item = stream.read()) {
      if (items.length < maxItems && _.get(item, 'enclosures[0]')) {
        items.push(item);
      }
    }
  });

  feedparser.on('end', function() {
    if (!resolved) {
      defer.resolve({channel: channel, items: items});
      resolved = true;
    }
  });

  return defer.promise;
}

module.exports = {
  query: queryFeed  
}
