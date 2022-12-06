import { createHealthCheckComment } from "../src/createHealthCheck";

describe("test for status page", () => {
  test("response status should return success", async () => {
    const res = await createHealthCheckComment();

    expect(res?.status).toBe(201);
  });
});
