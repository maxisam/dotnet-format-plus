import {RequestParameters} from '@octokit/types';

export type IRequestPayload = RequestParameters &
  Omit<
    {
      owner: string;
      repo: string;
    } & {
      per?: '' | 'day' | 'week' | undefined;
    },
    'baseUrl' | 'headers' | 'mediaType'
  >;

export function createActionRequest(owner: string, repo: string): IRequestPayload {
  return {
    owner,
    repo
  };
}
