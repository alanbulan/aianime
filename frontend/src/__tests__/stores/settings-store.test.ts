import { describe, expect, it } from "vitest";

import { useSettingsStore } from "@/modules/creative_canvas/public";

describe("settings store", () => {
  it("drops retired user-managed media storage credentials during migration", async () => {
    const migrate = useSettingsStore.persist.getOptions().migrate;
    expect(migrate).toBeTypeOf("function");

    const migrated = await migrate!(
      {
        mediaStorage: {
          provider: "aliyun_oss",
          aliyunOss: {
            accessKeyId: "legacy-access-id",
            accessKeySecret: "legacy-access-secret",
          },
        },
        showNodePrice: true,
      },
      20,
    );

    expect(migrated).not.toHaveProperty("mediaStorage");
    expect(migrated).toMatchObject({ showNodePrice: true });
    expect(useSettingsStore.getState()).not.toHaveProperty("mediaStorage");
  });
});
