// Copyright (c) 2026 AI anime

import {
  fetchByokModelCatalog,
  fetchByokProviderModelIds,
  type ByokModelAssignment,
  type ByokProviderProtocol,
} from "./commercial-model-access.js";
import {
  authorizationActivationId,
  authorizationDeviceId,
  authorizationLicenseId,
  projectCommercialBootstrap,
} from "./commercial-contracts.js";
import {
  CommercialApiError,
  optionalRecord,
  optionalText,
  requiredInteger,
  requiredUUID,
  requiredRecord,
  requiredText,
} from "./commercial-api-client.js";
import type { CommercialIpcContext } from "./commercial-ipc-context.js";
import {
  authorizationAllowsByok,
  mergeModelCatalogs,
  parseBootstrapQuery,
  parseInvocationQuery,
  parseModelCatalogQuery,
  rendererModelAccessStatus,
  updateCloudModelAssignments,
  verifyAuthorizationLease,
} from "./commercial-ipc-support.js";

export function registerCommercialModelHandlers(
  context: CommercialIpcContext,
): void {
  const { channels, client, options } = context;

  context.handle(channels.bootstrap, async (input) => {
    const device = await options.deviceIdentity.summary();
    const query = parseBootstrapQuery(input);
    const rawBootstrap = await client.bootstrap(
      {
        ...query,
        devicePublicKeyHash: device.publicKeyHash,
        currentVersion: query.currentVersion ?? options.clientVersion,
        target: query.target ?? options.platform,
        arch: query.arch ?? options.arch,
      },
      context.currentAuthorization?.device
        ? authorizationDeviceId(context.currentAuthorization)
        : undefined,
    );
    const bootstrap = projectCommercialBootstrap(rawBootstrap);
    const rawAuthorization = rawBootstrap.softwareAuthorization;
    context.currentAuthorization = bootstrap.softwareAuthorization
      ? verifyAuthorizationLease(
          rawAuthorization!,
          bootstrap.softwareAuthorization,
          options,
        )
      : null;
    bootstrap.softwareAuthorization = context.currentAuthorization;
    const access = await context.loadModelAccessForRouting();
    context.cloudModelAssignments = updateCloudModelAssignments(
      (access.cloudModelAssignments ?? []).length > 0
        ? access.cloudModelAssignments ?? []
        : context.cloudModelAssignments,
      bootstrap.models,
      query.modelOperation ?? "TEXT",
    );
    context.updateModelCapabilities(
      bootstrap.models,
      query.modelOperation ?? "TEXT",
    );
    if (bootstrap.models) {
      bootstrap.models = mergeModelCatalogs(
        bootstrap.models,
        authorizationAllowsByok(context.currentAuthorization)
          ? await fetchByokModelCatalog(access, query.modelOperation)
          : undefined,
      );
    }
    await context.synchronizeModelAccess();
    return bootstrap;
  });
  context.handle(channels.quotaBalance, () => client.quotaBalance());
  context.handle(channels.modelCatalog, async (input) => {
    const { source, query } = parseModelCatalogQuery(input);
    const authorization = await context.ensureCurrentAuthorization();
    const cloudCatalog = await client.modelCatalog(
      query,
      authorizationDeviceId(authorization),
    );
    context.updateModelCapabilities(cloudCatalog, query.operation);
    context.cloudModelAssignments = updateCloudModelAssignments(
      context.cloudModelAssignments,
      cloudCatalog,
      query.operation,
    );
    await context.synchronizeModelAccess();
    if (source === "cloud") {
      return cloudCatalog;
    }
    const byokCatalog = authorizationAllowsByok(authorization)
      ? await fetchByokModelCatalog(
          await context.loadModelAccessForRouting(),
          query.operation,
        )
      : undefined;
    return mergeModelCatalogs(
      cloudCatalog,
      byokCatalog,
    );
  });
  context.handle(channels.modelDetails, async (input) => {
    const authorization = await context.ensureCurrentAuthorization();
    return client.modelDetails(
      requiredText(input, "sku"),
      authorizationDeviceId(authorization),
    );
  });
  context.handle(channels.invocationList, (input) =>
    client.listInvocations(parseInvocationQuery(input)),
  );
  context.handle(channels.invocationDetails, (input) =>
    client.invocationDetails(requiredUUID(input, "id")),
  );
  context.handle(channels.cancelInvocation, async (input) => {
    const body = requiredRecord(input, "cancel invocation");
    const id = requiredUUID(body.id, "id");
    await client.cancelInvocation(id, requiredText(body.reason, "reason"));
    return client.invocationDetails(id);
  });
  context.handle(channels.saveInvocationResult, async (input) => {
    if (!options.saveInvocationResult) {
      throw new CommercialApiError("客户端尚未配置调用结果保存器");
    }
    return options.saveInvocationResult(requiredUUID(input, "id"));
  });

  registerLicenseHandlers(context);
  registerModelAccessHandlers(context);
}

function registerLicenseHandlers(context: CommercialIpcContext): void {
  const { channels, client, options } = context;

  context.handle(channels.currentLicense, async () =>
    context.publishAuthorization(await context.loadCurrentLicense()),
  );
  context.handle(channels.activateLicense, async () => {
    const current = await context.loadCurrentLicense();
    await client.activateLicense({
      licenseId: authorizationLicenseId(current),
      device: options.deviceIdentity,
      deviceName: options.deviceName,
      platform: options.platform,
      arch: options.arch,
      clientVersion: options.clientVersion,
    });
    return context.publishAuthorization(await context.loadCurrentLicense());
  });
  context.handle(channels.refreshLicenseLease, async () => {
    const current = await context.loadCurrentLicense();
    await client.refreshLicenseLease(authorizationActivationId(current));
    return context.publishAuthorization(await context.loadCurrentLicense());
  });
  context.handle(channels.deactivateLicense, async (input) => {
    const current = await context.loadCurrentLicense();
    await client.deactivateLicense(
      authorizationActivationId(current),
      requiredText(input, "reason"),
    );
    return context.publishAuthorization(await context.loadCurrentLicense());
  });
}

function registerModelAccessHandlers(context: CommercialIpcContext): void {
  const { channels, client, options } = context;

  context.handle(channels.modelAccessStatus, async () => {
    const authorization = await context.ensureCurrentAuthorization();
    const access = await options.modelAccessStore.load();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(authorization),
      client.baseUrl,
      context.cloudModelAssignments,
    );
  });
  context.handle(channels.configureByok, async (input) => {
    if (!authorizationAllowsByok(context.currentAuthorization)) {
      throw new CommercialApiError("当前商业版本不允许使用 BYOK", {
        status: 403,
      });
    }
    const body = requiredRecord(input, "BYOK config");
    const apiKey = optionalText(body.apiKey);
    if (
      body.modelAssignments !== undefined
      && !Array.isArray(body.modelAssignments)
    ) {
      throw new CommercialApiError("modelAssignments 必须是数组");
    }
    const access = await options.modelAccessStore.configureByok({
      ...(optionalText(body.providerId)
        ? { providerId: optionalText(body.providerId)! }
        : {}),
      ...(optionalText(body.name) ? { name: optionalText(body.name)! } : {}),
      ...(optionalText(body.protocol)
        ? { protocol: optionalText(body.protocol)! as ByokProviderProtocol }
        : {}),
      baseUrl: requiredText(body.baseUrl, "baseUrl"),
      ...(apiKey ? { apiKey } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(body.priority === undefined
        ? {}
        : { priority: requiredInteger(body.priority, "priority") }),
      ...(body.modelAssignments === undefined
        ? {}
        : { modelAssignments: body.modelAssignments as ByokModelAssignment[] }),
    });
    await context.synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      true,
      client.baseUrl,
      context.cloudModelAssignments,
    );
  });
  context.handle(channels.selectCloudModels, async (input) => {
    const body = optionalRecord(input);
    if (
      body.modelAssignments !== undefined
      && !Array.isArray(body.modelAssignments)
    ) {
      throw new CommercialApiError("modelAssignments 必须是数组");
    }
    const requestedAssignments = body.modelAssignments as
      | ByokModelAssignment[]
      | undefined;
    const access = await options.modelAccessStore.selectCloud(
      requestedAssignments,
    );
    if (
      requestedAssignments !== undefined
      || context.cloudModelAssignments.length === 0
    ) {
      context.cloudModelAssignments = [
        ...(access.cloudModelAssignments ?? []),
      ];
    }
    await context.synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(context.currentAuthorization),
      client.baseUrl,
      context.cloudModelAssignments,
    );
  });
  context.handle(channels.clearByok, async (input) => {
    const access = await options.modelAccessStore.clearByok(
      optionalText(optionalRecord(input).providerId),
    );
    await context.synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(context.currentAuthorization),
      client.baseUrl,
      context.cloudModelAssignments,
    );
  });
  context.handle(channels.byokProviderModels, async (input) => {
    if (!authorizationAllowsByok(context.currentAuthorization)) {
      throw new CommercialApiError("当前商业版本不允许使用 BYOK", {
        status: 403,
      });
    }
    const body = requiredRecord(input, "BYOK model discovery");
    const providerId = optionalText(body.providerId);
    const name = optionalText(body.name);
    const protocol = optionalText(body.protocol);
    const apiKey = optionalText(body.apiKey);
    const access = await options.modelAccessStore.load();
    return fetchByokProviderModelIds(access, {
      ...(providerId ? { providerId } : {}),
      ...(name ? { name } : {}),
      ...(protocol
        ? { protocol: protocol as ByokProviderProtocol }
        : {}),
      baseUrl: requiredText(body.baseUrl, "baseUrl"),
      ...(apiKey ? { apiKey } : {}),
    });
  });
}
