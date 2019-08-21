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
    failure,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets,
    Success,
    Tags,
} from "@atomist/automation-client";
import { ConfigurableCommandHandler } from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import {
    bitbucketApi,
    getBitbucketAuth,
    handleError,
} from "./bitbucketApi";

@ConfigurableCommandHandler("Raise a Bitbucket pull request", {
    intent: ["raise bitbucket pr", "raise bitbucket pullrequest" ],
    autoSubmit: true,
})
@Tags("github", "pr")
export class RaiseBitbucketPullRequest implements HandleCommand {

    @Parameter({ description: "pull request title", pattern: /^.*$/ })
    public title: string;

    @Parameter({
        description: "pull request body", pattern: /[\s\S]*/,
        required: false,
    })
    public body: string;

    @Parameter({
        description: "branch the changes should get pulled into",
        pattern: /^.*$/,
    })
    public base: string;

    @Parameter({
        description: "branch containing the changes",
        pattern: /^.*$/,
    })
    public head: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        const auth = getBitbucketAuth();
        const api = bitbucketApi(this.apiUrl, auth);
        return api.raisePR({
            project: this.owner,
            repo: this.repo,
            title: this.title,
            origin: this.head,
            body: this.body,
            target: this.base,
        })
            .catch(err => {
                return handleError("Raise Pull Request", err, ctx);
            })
            .then(() => Success, failure);
    }
}
