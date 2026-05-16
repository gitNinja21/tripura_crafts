#!/usr/bin/env node
/**
 * deduplicate-products.js
 *
 * One-shot script that removes duplicate rows from the products table,
 * keeping the row with the highest stock value for each (name, size) pair.
 * When stock values are equal the row with the lowest id is kept.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/deduplicate-products.js
 *   # or, if you have a .env file:
 *   npm run deduplicate
 *
 * The script is idempotent — running it multiple times is safe.
 */

'use strict';

try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Report what we are about to remove ────────────────────────────
    const dupeCheck = await client.query(`
      SELECT
        name,
        COALESCE(size, '(unsized)') AS size,
        COUNT(*)                    AS total_rows,
        MAX(stock)                  AS max_stock,
        MIN(id)                     AS keep_id
      FROM products
      GROUP BY name, COALESCE(size, '(unsized)')
      HAVING COUNT(*) > 1
      ORDER BY name, size
    `);

    if (dupeCheck.rowCount === 0) {
      console.log('No duplicate product rows found — nothing to do.');
      return;
    }

    console.log(`Found ${dupeCheck.rowCount} duplicate group(s):\n`);
    for (const row of dupeCheck.rows) {
      console.log(
        `  "${row.name}" size=${row.size}  ` +
        `rows=${row.total_rows}  max_stock=${row.max_stock}  keep_id=${row.keep_id}`
      );
    }
    console.log('');

    // ── 2. Delete duplicates inside a transaction ─────────────────────────
    await client.query('BEGIN');

    // For each (name, size) group that has duplicates:
    //   • Find the row to KEEP: highest stock; ties broken by lowest id.
    //   • Delete every other row in that group.
    //
    // The UPDATE first sets the surviving row's stock to the group maximum
    // (in case the highest-stock row is not the one with the lowest id),
    // then the DELETE removes all other rows.
    const deleteResult = await client.query(`
      WITH ranked AS (
        SELECT
          id,
          name,
          COALESCE(size, '') AS size_key,
          stock,
          -- Rank within each (name, size) group:
          --   rank 1 = highest stock; ties broken by lowest id (oldest row).
          ROW_NUMBER() OVER (
            PARTITION BY name, COALESCE(size, '')
            ORDER BY stock DESC, id ASC
          ) AS rn,
          MAX(stock) OVER (
            PARTITION BY name, COALESCE(size, '')
          ) AS max_stock
        FROM products
      ),
      keeper AS (
        -- Update the surviving row to carry the group's maximum stock value.
        UPDATE products p
        SET    stock = r.max_stock
        FROM   ranked r
        WHERE  p.id = r.id
          AND  r.rn = 1
          AND  r.max_stock <> p.stock   -- skip no-op updates
        RETURNING p.id
      )
      -- Delete every row that is NOT the keeper (rn > 1).
      DELETE FROM products
      WHERE id IN (
        SELECT id FROM ranked WHERE rn > 1
      )
      RETURNING id, name, size, stock
    `);

    await client.query('COMMIT');

    if (deleteResult.rowCount === 0) {
      console.log('No rows deleted (duplicates may have already been cleaned up).');
    } else {
      console.log(`Deleted ${deleteResult.rowCount} duplicate row(s):`);
      for (const row of deleteResult.rows) {
        console.log(`  id=${row.id}  "${row.name}"  size=${row.size ?? '(unsized)'}  stock=${row.stock}`);
      }
    }

    // ── 3. Final state ────────────────────────────────────────────────────
    const remaining = await client.query(
      `SELECT id, name, size, stock FROM products ORDER BY name, size`
    );
    console.log(`\nProducts table now has ${remaining.rowCount} row(s) — all unique.`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Deduplication failed, transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
