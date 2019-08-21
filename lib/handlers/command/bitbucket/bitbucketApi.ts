/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    configurationValue,
    failure,
    HandlerContext,
    HandlerError,
    HandlerResult,
    HttpClient,
    HttpClientFactory,
    HttpMethod,
    MessageOptions,
    Success,
} from "@atomist/automation-client";
import { slackErrorMessage } from "@atomist/sdm";

export interface EmptyResult {
    httpCode: number;
}

export interface BitbucketApi {
    deleteBranch(project: string, repo: string, branchName: string): Promise<EmptyResult>;
    mergePR(project: string, repo: string, pr: number): Promise<EmptyResult>;
    canPRBeMerged(project: string, repo: string, pr: number): Promise<boolean>;
    raisePR(project: string, repo: string, prContent: PrContent): Promise<number>;
    createTag(project: string, repo: string, tagOptions: TagOptions): Promise<EmptyResult>;
}

export interface TagOptions {
    tagName: string;
    sha: string;
    message: string;
}

export interface PrContent {
    title: string;
    body: string;
    origin: string;
    target: string;
}

export interface BitbucketAuth {
    username: string;
    password: string;
}

export function bitbucketApi(apiUrl: string, auth: BitbucketAuth): BitbucketApi {
    return new BitbucketApiImpl({
        apiUrl,
        auth,
    });
}

interface BitbucketApiOptions {
    apiUrl: string;
    auth: BitbucketAuth;
}

class BitbucketApiImpl implements BitbucketApi {
    private readonly apiOptions: BitbucketApiOptions;
    private readonly httpClient: HttpClient;

    constructor(apiOptions: BitbucketApiOptions) {
        this.apiOptions = apiOptions;
        this.httpClient = configurationValue<HttpClientFactory>("http.client.factory").create(apiOptions.apiUrl);
    }

    public async addCommentToPR(project: string, repo: string, pr: string, comment: string): Promise<EmptyResult> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr}/comments`;
        const body = {
            text: comment,
        };
        return this.httpClient.exchange(urlPattern, {
            body,
            method: HttpMethod.Post,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({ httpCode: response.status}))
            .catch(reason => Promise.reject(reason));
    }

    private getBase64AuthHeaderValue(auth: BitbucketAuth): string {
        return Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    }

    public async deleteBranch(project: string, repo: string, branchName: string): Promise<EmptyResult> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/branch-utils/1.0/projects/${project}/repos/${repo}/branches`;
        const body = {
            name: `refs/heads/${branchName}`,
            dryRun: false,
        };
        return this.httpClient.exchange(urlPattern, {
            body,
            method: HttpMethod.Delete,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({ httpCode: response.status}))
            .catch(reason => Promise.reject(reason));
    }

    public async mergePR(project: string, repo: string, pr: number): Promise<EmptyResult> {
        const version = await this.getPRVersion(project, repo, pr);
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr}/merge?version=${version}`;
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Post,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({ httpCode: response.status}))
            .catch(reason => Promise.reject(reason));
    }

    public async getPRVersion(project: string, repo: string, pr: number): Promise<number> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr}`;
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Get,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve((response.body as any).version))
            .catch(reason => Promise.reject(reason));
    }

    public async raisePR(project: string, repo: string, prContent: PrContent): Promise<number> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests`;
        const body = {
            title: prContent.title,
            description: prContent.body,
            state: "OPEN",
            open: true,
            closed: false,
            fromRef: {
                id: `refs/heads/${prContent.origin}`,
                repository: {
                    slug: repo,
                    project: {
                        key: project,
                    },
                },
            },
            toRef: {
                id: `refs/heads/${prContent.target}`,
                repository: {
                    slug: repo,
                    project: {
                        key: project,
                    },
                },
            },
            locked: false,
        };
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Post,
            body,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve((response as any).id))
            .catch(reason => Promise.reject(reason));
    }

    public async canPRBeMerged(project: string, repo: string, pr: number): Promise<boolean> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr}/merge`;
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Get,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve((response.body as any).canMerge))
            .catch(reason => Promise.reject(reason));
    }

    public async createTag(project: string, repo: string, tagOptions: TagOptions): Promise<EmptyResult> {
        return undefined;
    }
}

export function getBitbucketAuth(): BitbucketAuth {
    return {
        username: configurationValue<string>("sdm.bitbucket.lifecycle.username"),
        password: configurationValue<string>("sdm.bitbucket.lifecycle.password"),
    };
}

export function handleError(title: string,
                            err: any,
                            ctx: HandlerContext,
                            options?: MessageOptions): Promise<HandlerResult> | HandlerError {
    switch (err.code) {
        case 400:
        case 422:
            return ctx.messageClient.respond(
                slackErrorMessage(
                    title,
                    "The request contained errors.",
                    ctx,
                ),
                options)
                .then(() => Success, failure);
        case 403:
        case 404:
            return ctx.messageClient.respond(
                slackErrorMessage(
                    title,
                    "You are not authorized to access the requested resource.",
                    ctx,
                ),
                options)
                .then(() => Success, failure);
        default:
            if (err.message) {
                return ctx.messageClient.respond(
                    slackErrorMessage(
                        title,
                        "Error occurred. Please contact support.",
                        ctx,
                    ),
                    options)
                    .then(() => Success, failure);
            }
            return failure(err);

    }
}
