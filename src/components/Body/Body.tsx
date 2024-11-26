'use client';

import 'regenerator-runtime';

import { useEffect, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { FormGroup } from '@blueprintjs/core';
import { Button, InputGroup, MenuItem, Text } from '@blueprintjs/core/lib/esm/components';
import { Select2 } from '@blueprintjs/select';
import { ItemRenderer, ItemRendererProps } from '@blueprintjs/select/lib/esm/common';

import { getAudio, getSubscriptionInfo, getVoices } from '../../util/elevenlabs';

import { ISubscription, IVoice } from '@/types/elevenlabs';

import classes from './Body.module.scss';

function renderVoice(
  voice: IVoice,
  itemProps: ItemRendererProps
) {
  if (!itemProps.modifiers) return null;
  
  return (
    <MenuItem
      active={itemProps.modifiers.active}
      disabled={itemProps.modifiers.disabled}
      key={voice.voice_id}
      onClick={itemProps.handleClick}
      onFocus={itemProps.handleFocus}
      text={voice.name}
      label={voice.category === 'cloned' ? 'Cloned' : 'Default'}
    />
  );
}

function Body() {
  const [apiKey, setApiKey] = useState<string>('');
  const [voices, setVoices] = useState<IVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<IVoice | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<ISubscription | null>(null);

  const { transcript, listening, resetTranscript } = useSpeechRecognition();

  async function doAudio() {
    if (transcript !== '' && apiKey !== '' && selectedVoice !== null) {
      try {
        const audioUrl = await getAudio(
          selectedVoice.voice_id,
          apiKey,
          transcript.substring(0, 5000)
        );
        new Audio(audioUrl).play();

        setSubscriptionInfo(await getSubscriptionInfo(apiKey));
      } catch {
        // Do nothing
      }
    }
    resetTranscript();
    SpeechRecognition.startListening();
  }

  useEffect(() => {
    (async () => {
      if (apiKey.length === 32) {
        try {
          setSubscriptionInfo(await getSubscriptionInfo(apiKey));

          const voices = await getVoices(apiKey);
          setVoices(voices);
          setSelectedVoice(voices[0]);
        } catch {
          setVoices([]);
          setSelectedVoice(null);
        }
        return;
      }
      setVoices([]);
    })();
  }, [apiKey]);

  useEffect(() => {
    (async () => {
      if (transcript.length > 5000) {
        await doAudio();
      }
    })();
  }, [transcript]);

  useEffect(() => {
    (async () => {
      if (!listening) {
        await doAudio();
      }
    })();
  }, [listening]);

  async function startListening() {
    await SpeechRecognition.startListening();
  }
  async function stopListening() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  return (
    <div className={classes.root}>
      <div className={classes.content}>
        <FormGroup
          label='ElevenLabs API Key'
          helperText='You can view your API key in the "Profile" section on https://beta.elevenlabs.io.'
        >
          <InputGroup
            placeholder='Your API key...'
            value={apiKey}
            onChange={(e) => {
              return setApiKey(e.target.value);
            }}
            type='password'
          />
        </FormGroup>

        {voices?.length > 0 && (
          <FormGroup label='Select a voice...'>
            <Select2<IVoice>
              items={voices}
              itemRenderer={(voice, props) => renderVoice(voice, props)}
              filterable={false}
              activeItem={selectedVoice}
              onItemSelect={setSelectedVoice}
              popoverProps={{ minimal: true }}
            >
              <Button
                text={selectedVoice?.name || 'Select a voice...'}
                rightIcon='caret-down'
                fill={true}
              />
            </Select2>
          </FormGroup>
        )}

        <div className={classes.buttonGroup}>
          <Button intent='success' onClick={startListening} icon='play' disabled={listening}>
            Start
          </Button>
          <Button intent='danger' onClick={stopListening} icon='stop' disabled={!listening}>
            Stop
          </Button>
        </div>

        <h3>Transcript ({transcript.length}/5000)</h3>
        <pre className='bp4-code-block'>
          <code>{transcript || 'Say something...'}</code>
        </pre>
        <div className={classes.belowTranscript}>
          {subscriptionInfo && (
            <Text>
              Total quota remaining:{' '}
              {subscriptionInfo.character_limit - subscriptionInfo.character_count}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

export default Body;
