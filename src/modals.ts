export enum INPUTS {
  authToken = 'authToken',
  owner = 'owner',
  repository = 'repository'
}

export interface IInputs {
  authToken: string
  owner: string
  repository: string
}
