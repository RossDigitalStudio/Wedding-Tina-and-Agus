import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export async function databaseFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table public.weddings(id uuid primary key default gen_random_uuid(), slug text, partner_one_name text, partner_two_name text, ceremony_date date);
    create table public.wedding_members(wedding_id uuid references weddings(id), user_id uuid);
    create publication supabase_realtime;
  `);
  await db.exec(await readFile(new URL("../supabase/004_album_digital.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/005_album_guests_social.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration); // Safe to run again after an interrupted rollout.
  const weddingId = randomUUID(),
    albumId = randomUUID(),
    guestId = randomUUID();
  await db.query(
    "insert into weddings(id, slug, partner_one_name, partner_two_name, ceremony_date) values ($1, $2, $3, $4, $5)",
    [weddingId, "agus-y-tina", "Agustina", "Agustín", "2027-10-23"],
  );
  await db.query(
    "insert into wedding_albums(id, wedding_id, slug, title, max_uploads_per_guest) values ($1, $2, $3, $4, 2)",
    [albumId, weddingId, "agus-y-tina", "Agustina & Agustín"],
  );
  await db.query("insert into album_guests(id, album_id, display_name, session_token_hash) values ($1, $2, $3, $4)", [
    guestId,
    albumId,
    "Agus",
    "test-secret-hash",
  ]);
  return { db, weddingId, albumId, guestId };
}
const payload = () => {
  const id = randomUUID();
  return {
    id,
    client_upload_id: randomUUID(),
    media_type: "photo",
    original_filename: "foto.jpg",
    mime_type: "image/jpeg",
    file_size_bytes: 100,
    original_key: `${id}.jpg`,
    preview_key: `${id}.webp`,
    upload_token_hash: "test-upload-hash",
  };
};
async function reserve(db, guestId, data) {
  return (await db.query("select * from album_reserve_upload($1, $2::jsonb)", [guestId, JSON.stringify(data)])).rows[0];
}
async function finish(db, guestId, id) {
  return (
    await db.query("select * from album_finish_upload($1, $2, $3, 100, 100, null)", [guestId, id, "test-upload-hash"])
  ).rows[0];
}

test("quota, retries, failed reservations, completion and blocking", async () => {
  const { db, guestId } = await databaseFixture();
  try {
    const first = payload(),
      second = payload();
    await reserve(db, guestId, first);
    await reserve(db, guestId, second);
    await assert.rejects(reserve(db, guestId, payload()), /GUEST_LIMIT/);
    assert.equal((await reserve(db, guestId, first)).id, first.id, "retry reuses the reservation");
    await finish(db, guestId, first.id);
    assert.equal(
      (await reserve(db, guestId, first)).upload_state,
      "ready",
      "retry after a lost response does not duplicate",
    );
    await db.query("update album_media set upload_state = 'failed' where id = $1", [second.id]);
    const third = payload();
    await reserve(db, guestId, third);
    await db.query("update album_guests set display_name = 'Otro nombre' where id = $1", [guestId]);
    await assert.rejects(reserve(db, guestId, payload()), /GUEST_LIMIT/);
    await db.query("update album_guests set blocked = true where id = $1", [guestId]);
    await assert.rejects(finish(db, guestId, third.id), /GUEST_BLOCKED/);
  } finally {
    await db.close();
  }
});
test("unlimited quota and expired reservations cannot complete", async () => {
  const { db, albumId, guestId } = await databaseFixture();
  try {
    await db.query("update wedding_albums set max_uploads_per_guest = 0 where id = $1", [albumId]);
    const first = payload();
    await reserve(db, guestId, first);
    for (let i = 0; i < 4; i++) await reserve(db, guestId, payload());
    await db.exec("alter table album_media disable trigger album_media_touch_updated_at");
    await db.query("update album_media set updated_at = now() - interval '25 hours' where id = $1", [first.id]);
    await assert.rejects(finish(db, guestId, first.id), /UPLOAD_EXPIRED/);
  } finally {
    await db.close();
  }
});
test("private social data and quota functions cannot be read/called by guests", async () => {
  const { db, guestId } = await databaseFixture();
  try {
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from album_guests"), /permission denied/);
    await assert.rejects(db.query("select * from album_sparks"), /permission denied/);
    await assert.rejects(reserve(db, guestId, payload()), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.query("select session_token_hash, instagram_handle from album_guests"),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select id, display_name from album_guests")).rows.length,
      0,
      "signed-in outsider has no wedding access",
    );
  } finally {
    await db.close();
  }
});
test("wedding member can block but cannot change guest identity or read contact", async () => {
  const { db, weddingId, guestId } = await databaseFixture();
  try {
    const userId = randomUUID();
    await db.query("insert into wedding_members(wedding_id, user_id) values ($1, $2)", [weddingId, userId]);
    await db.query("select set_config('test.uid', $1, false)", [userId]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select id, display_name from album_guests")).rows.length, 1);
    await db.query("update album_guests set blocked = true where id = $1", [guestId]);
    await assert.rejects(
      db.query("update album_guests set display_name = 'Impostor' where id = $1", [guestId]),
      /permission denied/,
    );
    await assert.rejects(db.query("select instagram_handle from album_guests"), /permission denied/);
  } finally {
    await db.close();
  }
});
test("sparks require distinct people in the same album and adult opt-in", async () => {
  const { db, albumId, guestId } = await databaseFixture();
  try {
    await assert.rejects(
      db.query("update album_guests set sparks_enabled = true where id = $1", [guestId]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("insert into album_sparks(album_id, from_guest_id, to_guest_id) values ($1, $2, $2)", [
        albumId,
        guestId,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("insert into album_sparks(album_id, from_guest_id, to_guest_id) values ($1, $2, $3)", [
        albumId,
        guestId,
        randomUUID(),
      ]),
      /foreign key/,
    );
  } finally {
    await db.close();
  }
});
test("scheduled public reveal respects gallery visibility, live remains independent", async () => {
  const { db, albumId, guestId } = await databaseFixture();
  try {
    const data = payload();
    await reserve(db, guestId, data);
    await finish(db, guestId, data.id);
    await db.query(
      "update wedding_albums set gallery_reveal_at = now() + interval '1 day', live_enabled = false where id = $1",
      [albumId],
    );
    await db.exec("set role anon");
    assert.equal((await db.query("select id from album_media")).rows.length, 0);
    await db.exec("reset role");
    await db.query("update wedding_albums set live_enabled = true where id = $1", [albumId]);
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select id from album_media")).rows.length,
      1,
      "live selection is independent of scheduled reveal",
    );
    await db.exec("reset role");
    await db.query(
      "update wedding_albums set gallery_reveal_at = now() - interval '1 minute', live_enabled = false where id = $1",
      [albumId],
    );
    await db.exec("set role anon");
    assert.equal((await db.query("select id from album_media")).rows.length, 1);
  } finally {
    await db.close();
  }
});
