import { observer } from "mobx-react-lite";
import React from "react";
import { MIMO_PRESET_VOICES, TTSPluginSettingsStore } from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, TextareaSetting } from "../setting-components";

const MIMO_ENDPOINT_OPTIONS = [
  {
    label: "Standard API (api.xiaomimimo.com)",
    value: "standard",
  },
  {
    label: "Coding Plan China (token-plan-cn.xiaomimimo.com)",
    value: "coding-plan-cn",
  },
] as const;

export const MimoSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <OptionSelectSetting
          name="API Endpoint"
          description="Choose the Mimo API endpoint that matches your API key. Coding Plan keys use the China token-plan endpoint."
          store={store}
          provider="mimo"
          fieldName="mimo_apiEndpoint"
          options={MIMO_ENDPOINT_OPTIONS}
        />
        <ApiKeyComponent
          store={store}
          provider="mimo"
          fieldName="mimo_apiKey"
          displayName="Mimo API key"
          helpUrl="https://mimo.mi.com/"
          showValidation={true}
        />
        <MimoVoiceComponent store={store} />
        <TextareaSetting
          name="Style Instructions"
          description="Optional natural-language instructions for speech style. These are sent in the user message and do not appear in the spoken text."
          store={store}
          provider="mimo"
          fieldName="mimo_ttsInstructions"
          placeholder="Example: Speak in a warm, relaxed tone with a slightly slower pace."
          rows={3}
        />
      </>
    );
  },
);

const MimoVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const voices = React.useMemo(
    () =>
      MIMO_PRESET_VOICES.map((voice) => ({
        label: voice.gender
          ? `${voice.label} — ${voice.language}, ${voice.gender}`
          : `${voice.label} — ${voice.language}`,
        value: voice.value,
      })),
    [],
  );

  React.useEffect(() => {
    if (voices.some((voice) => voice.value === store.settings.mimo_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("mimo", {
      mimo_ttsVoice: voices[0].value,
    });
  }, [store.settings.mimo_ttsVoice, voices, store]);

  return (
    <OptionSelectSetting
      name="Voice"
      description="The preset voice to use for speech synthesis."
      store={store}
      provider="mimo"
      fieldName="mimo_ttsVoice"
      options={voices}
    />
  );
});
