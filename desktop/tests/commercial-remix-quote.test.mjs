import assert from "node:assert/strict";
import test from "node:test";
import { modelQuoteKind, videoRemixQuoteOrigin, billingRequestFingerprint } from "../src/commercial-metered-billing.ts";

test("remix quotes bind the canonical original invocation in the route", async () => {
  const a = "/v1/videos/11111111-1111-4111-8111-111111111111/remix";
  const b = "/v1/videos/22222222-2222-4222-8222-222222222222/remix";
  assert.equal(modelQuoteKind(a), "video-remix");
  assert.equal(videoRemixQuoteOrigin(a), "11111111-1111-4111-8111-111111111111");
  for (const path of [a+"?origin=other", a+"#other", "/v1/videos/not-an-invocation/remix", "/v1/videos/11111111-1111-4111-8111-111111111111"]) assert.equal(videoRemixQuoteOrigin(path),null);
  const body = {body: JSON.stringify({prompt:"same prompt"}),contentType:"application/json"};
  assert.notEqual(await billingRequestFingerprint("cloud-video",a,body),await billingRequestFingerprint("cloud-video",b,body));
});
