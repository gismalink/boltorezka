import { beforeEach, describe, expect, it } from "vitest";
import { isActiveTopicSoundMuted, setActiveTopicSoundMuted } from "./activeTopicSoundMute";

describe("activeTopicSoundMute", () => {
  beforeEach(() => {
    setActiveTopicSoundMuted(false);
  });

  it("defaults to not muted", () => {
    expect(isActiveTopicSoundMuted()).toBe(false);
  });

  it("setActiveTopicSoundMuted(true) flips state to muted", () => {
    setActiveTopicSoundMuted(true);
    expect(isActiveTopicSoundMuted()).toBe(true);
  });

  it("setActiveTopicSoundMuted(false) flips state back", () => {
    setActiveTopicSoundMuted(true);
    setActiveTopicSoundMuted(false);
    expect(isActiveTopicSoundMuted()).toBe(false);
  });

  it("coerces truthy/falsy non-boolean inputs", () => {
    setActiveTopicSoundMuted(1 as unknown as boolean);
    expect(isActiveTopicSoundMuted()).toBe(true);
    setActiveTopicSoundMuted(0 as unknown as boolean);
    expect(isActiveTopicSoundMuted()).toBe(false);
  });
});
