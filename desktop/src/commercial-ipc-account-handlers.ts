// Copyright (c) 2026 AI anime

import {
  requiredRawText,
  requiredRecord,
  requiredText,
} from "./commercial-api-client.js";
import {
  parseLoginInput,
  parseProfileUpdateInput,
  parseRegistrationInput,
  parseRememberedLoginInput,
  requiredBytes,
} from "./commercial-ipc-support.js";
import type { CommercialIpcContext } from "./commercial-ipc-context.js";

export function registerCommercialAccountHandlers(
  context: CommercialIpcContext,
): void {
  const { channels, client, options } = context;

  context.handle(channels.status, () => ({
    configured: true,
    gatewayOrigin: client.baseUrl,
  }));
  context.handle(channels.publicConfig, (input) =>
    client.publicConfig(requiredText(input, "tenantCode")),
  );
  context.handle(channels.publicLogo, (input) =>
    client.publicLogo(requiredText(input, "tenantCode")),
  );
  context.handle(channels.publicCaptcha, (input) =>
    client.publicCaptcha(requiredText(input, "tenantCode")),
  );
  context.handle(channels.register, (input) =>
    client.register(parseRegistrationInput(input)),
  );
  context.handle(channels.session, async () => {
    const session = await client.restoreSession();
    if (session) {
      await options.onAuthenticated(session);
      await context.hydrateModelAccess();
    } else {
      context.resetModelState();
      await context.synchronizeModelAccess();
      await options.onLoggedOut();
    }
    return session;
  });
  context.handle(channels.rememberedLogin, () => client.rememberedLogin());
  context.handle(channels.revealRememberedPassword, () =>
    client.revealRememberedPassword(),
  );
  context.handle(channels.login, (input) =>
    context.authenticate(() => client.login(parseLoginInput(input))),
  );
  context.handle(channels.loginRemembered, (input) =>
    context.authenticate(() =>
      client.loginRemembered(parseRememberedLoginInput(input)),
    ),
  );
  context.handle(channels.logout, async () => {
    const result = await client.logout();
    await context.clearAuthenticatedState();
    return result;
  });
  context.handle(channels.profile, () => client.currentProfile());
  context.handle(channels.updateProfile, (input) =>
    client.updateProfile(parseProfileUpdateInput(input)),
  );
  context.handle(channels.avatar, () => client.currentAvatar());
  context.handle(channels.uploadAvatar, async (input) => {
    const upload = requiredRecord(input, "avatar upload");
    const contentType = requiredText(
      upload.contentType,
      "contentType",
    ).toLowerCase();
    const bytes = requiredBytes(upload.bytes, "bytes");
    await client.uploadAvatar({
      fileName: requiredText(upload.fileName, "fileName"),
      contentType,
      bytes,
    });
    return {
      profile: await client.currentProfile(),
      avatar: {
        contentType,
        dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
      },
    };
  });
  context.handle(channels.deleteAvatar, async () => {
    await client.deleteAvatar();
    return { profile: await client.currentProfile() };
  });
  context.handle(channels.changePassword, async (input) => {
    const body = requiredRecord(input, "change password");
    await client.changePassword(
      requiredRawText(body.oldPassword, "oldPassword"),
      requiredRawText(body.newPassword, "newPassword"),
    );
    await context.clearAuthenticatedState();
  });
  context.handle(channels.sendPasswordResetCode, async (input) => {
    const body = requiredRecord(input, "send password reset code");
    await client.sendPasswordResetCode(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.email, "email"),
    );
  });
  context.handle(channels.verifyPasswordResetCode, (input) => {
    const body = requiredRecord(input, "verify password reset code");
    return client.verifyPasswordResetCode(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.email, "email"),
      requiredText(body.code, "code"),
    );
  });
  context.handle(channels.resetPassword, async (input) => {
    const body = requiredRecord(input, "reset password");
    await client.resetPassword(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.resetTicket, "resetTicket"),
      requiredRawText(body.newPassword, "newPassword"),
    );
  });
}
