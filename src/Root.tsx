import React from "react";
import { Composition } from "remotion";
import { StoryVideo } from "./StoryVideo";
import storyJson from "../input/story.json";
import { FPS, HEIGHT, StorySchema, WIDTH, totalFrames, type Story } from "./lib/script-schema";

const defaultStory: Story = StorySchema.parse(storyJson);

export const RemotionRoot: React.FC = () => (
  <Composition
    id="StoryVideo"
    component={StoryVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={totalFrames(defaultStory)}
    defaultProps={{ story: defaultStory }}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props.story) })}
  />
);
