// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommercialProfileSection,
  resolveAvatarContentType,
} from "@/modules/identity_access/presentation/CommercialProfileSection";

const loadProfile = vi.fn();
const updateProfile = vi.fn();
const uploadAvatar = vi.fn();
const deleteAvatar = vi.fn();

const state = {
  profile: {
    id: 1,
    username: "wrl",
    nickname: "",
    email: "",
    phone: "",
    gender: 1 as const,
    avatar: "",
    status: 1,
    deptId: 0,
    deptName: "",
    profileDescription: "",
  },
  avatarDataUrl: null,
  loadProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
};

vi.mock("@/modules/identity_access/composition", () => ({
  useCommercialAuthStore: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "settings.account.profileTitle": "账户资料",
        "settings.account.profileHint": "资料说明",
        "settings.account.nickname": "昵称",
        "settings.account.email": "邮箱",
        "settings.account.phone": "手机号",
        "settings.account.gender": "性别",
        "settings.account.genderUnknown": "未设置",
        "settings.account.genderMale": "男",
        "settings.account.genderFemale": "女",
        "settings.account.profileDescription": "个人简介",
        "settings.account.noDepartment": "未设置部门",
        "settings.account.changeAvatar": "更换头像",
        "settings.account.avatarHint": "头像说明",
        "settings.account.saveProfile": "保存资料",
        "settings.account.avatarUpdated": "头像已更新",
      })[key] ?? key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("CommercialProfileSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadProfile.mockResolvedValue(state.profile);
    uploadAvatar.mockResolvedValue(undefined);
  });

  it("关闭性别菜单时显示中文标签", async () => {
    render(<CommercialProfileSection active bridgeAvailable />);

    expect(await screen.findByRole("combobox", { name: "性别" })).toHaveTextContent(
      "男",
    );
    expect(screen.getByRole("combobox", { name: "性别" })).not.toHaveTextContent(
      "1",
    );
  });

  it("通过原生文件入口上传并归一化 Windows 缺失的 MIME", async () => {
    const { container } = render(
      <CommercialProfileSection active bridgeAvailable />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, {
      target: { files: [new File(["image"], "avatar.png")] },
    });

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledTimes(1));
    const uploaded = uploadAvatar.mock.calls[0]?.[0] as File;
    expect(uploaded.name).toBe("avatar.png");
    expect(uploaded.type).toBe("image/png");
  });

  it("仅通过头像框提供更换头像入口", () => {
    render(<CommercialProfileSection active bridgeAvailable />);

    expect(
      screen.getAllByRole("button", { name: "更换头像" }),
    ).toHaveLength(1);
  });
});

describe("resolveAvatarContentType", () => {
  it("仅接受合同允许的头像格式", () => {
    expect(resolveAvatarContentType({ name: "avatar.JPG", type: "" })).toBe(
      "image/jpeg",
    );
    expect(resolveAvatarContentType({ name: "avatar.gif", type: "image/gif" })).toBeNull();
  });
});
