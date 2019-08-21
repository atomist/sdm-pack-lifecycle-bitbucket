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

export interface ApiResult<T> {
    httpCode?: number;
    result?: T;
}

export interface BaseApiRequest {
    project: string;
    repo: string;
}

export interface DeleteBranchRequest extends BaseApiRequest {
    branchName: string;
}

export interface MergePRRequest extends BaseApiRequest {
    pr: number;
}

export interface CanPRBeMergedRequest extends BaseApiRequest {
    pr: number;
}

export interface RaisePRRequest extends BaseApiRequest {
    title: string;
    body: string;
    origin: string;
    target: string;
}

export interface CreateTagRequest extends BaseApiRequest {
    tagName: string;
    sha: string;
    message: string;
}

export interface BitbucketApi {
    deleteBranch(request: DeleteBranchRequest): Promise<ApiResult<void>>;
    mergePR(request: MergePRRequest): Promise<ApiResult<void>>;
    canPRBeMerged(request: CanPRBeMergedRequest): Promise<ApiResult<boolean>>;
    raisePR(request: RaisePRRequest): Promise<ApiResult<number>>;
    createTag(request: CreateTagRequest): Promise<ApiResult<void>>;
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

    private getBase64AuthHeaderValue(auth: BitbucketAuth): string {
        return Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    }

    public async deleteBranch(r: DeleteBranchRequest): Promise<ApiResult<void>> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/branch-utils/1.0/projects/${r.project}/repos/${r.repo}/branches`;
        const body = {
            name: `refs/heads/${r.branchName}`,
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

    public async mergePR(r: MergePRRequest): Promise<ApiResult<void>> {
        const version = (await this.getPRVersion(r.project, r.repo, r.pr)).result;
        const url = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${r.project}/repos/${r.repo}/pull-requests/${r.pr}/merge?version=${version}`;
        return this.httpClient.exchange(url, {
            method: HttpMethod.Post,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({ httpCode: response.status}))
            .catch(reason => Promise.reject(reason));
    }

    private async getPRVersion(project: string, repo: string, pr: number): Promise<ApiResult<number>> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr}`;
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Get,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({
                httpCode: response.status,
                result: (response.body as any).version }))
            .catch(reason => Promise.reject(reason));
    }

    public async raisePR(r: RaisePRRequest): Promise<ApiResult<number>> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${r.project}/repos/${r.repo}/pull-requests`;
        const body = {
            title: r.title,
            description: r.body,
            state: "OPEN",
            open: true,
            closed: false,
            fromRef: {
                id: `refs/heads/${r.origin}`,
                repository: {
                    slug: r.repo,
                    project: {
                        key: r.project,
                    },
                },
            },
            toRef: {
                id: `refs/heads/${r.target}`,
                repository: {
                    slug: r.repo,
                    project: {
                        key: r.project,
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
            .then(response => Promise.resolve({result: (response as any).id}))
            .catch(reason => Promise.reject(reason));
    }

    public async canPRBeMerged(r: CanPRBeMergedRequest): Promise<ApiResult<boolean>> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/api/1.0/projects/${r.project}/repos/${r.repo}/pull-requests/${r.pr}/merge`;
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Get,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({httpCode: response.status, result: (response.body as any).canMerge}))
            .catch(reason => Promise.reject(reason));
    }

    public async createTag(r: CreateTagRequest): Promise<ApiResult<void>> {
        const urlPattern = `${this.apiOptions.apiUrl}rest/git/1.0/projects/${r.project}/repos/${r.repo}/tags`;
        const body = {
            message: `${r.message}`,
            name: r.tagName,
            startPoint: r.sha,
            type: "ANNOTATED",
        };
        return this.httpClient.exchange(urlPattern, {
            method: HttpMethod.Post,
            body,
            headers: {
                Authorization: `Basic ${this.getBase64AuthHeaderValue(this.apiOptions.auth)}`,
            },
        })
            .then(response => Promise.resolve({httpCode: response.status}))
            .catch(reason => Promise.reject(reason));
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
