'use strict';

/**
 * lib/routes.js — Single source of truth for all route → hash path mappings.
 *
 * Each page gets a unique 64-char hex hash as its public URL.
 * All navigation links, build output paths, and server routes use this map.
 *
 * DO NOT change these hashes after deployment — it will break shared links.
 */

const ROUTE_MAP = {
  '/'                  : '/',
  '/author'            : '/e9a4f2c8b3d7e1f6a5c2e8d4b9f3a7c1e6d2b8f5a3c9e4d1b7f2a6c3e8d5b1f9a4',
  '/review'            : '/f1b7e3a9c4d8f2b5e9a3c7d1f8b4e2a6c9d5f3b1e7a4c2d8f6b9e1a5c3d7f4b2e8',
  '/author/submission' : '/a3d9f5b1e7c2d8f4a6c1e9b3d5f7a2c8e4b6d1f9a5c3e7b2d4f8a1c6e3b9d2f5a7',
  '/author/email'      : '/b8f4a2c6e1d9b5f3a7c4e8d2b6f1a9c3e5d7b4f2a8c1e6d3b7f5a2c9e4d1b6f8a3',
  '/author/editing'    : '/c6e2b9f4a1d7c3e8b5f2a4c9e1d6b3f8a7c2e5d9b1f4a8c3e2d5b7f9a1c6e4d2b8',
};

// Reverse map: hash → clean path (used by express server)
const HASH_TO_PATH = {};
for (const [clean, hash] of Object.entries(ROUTE_MAP)) {
  HASH_TO_PATH[hash] = clean;
}

module.exports = { ROUTE_MAP, HASH_TO_PATH };
