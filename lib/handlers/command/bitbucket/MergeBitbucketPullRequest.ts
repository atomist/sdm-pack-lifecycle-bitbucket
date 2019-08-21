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
import { slackWarningMessage } from "@atomist/sdm";
import {
    bitbucketApi,
    BitbucketApi,
    getBitbucketAuth,
    handleError,
} from "./bitbucketApi";

/**
 * Merge a GitHub Pull Request.
 */
@ConfigurableCommandHandler("Merge a GitHub Pull Request", {
    intent: ["merge bitbucket pr", "merge bitbucket pullrequest"],
    autoSubmit: true,
})
@Tags("bitbucket", "pr")
export class MergeBitbucketPullRequest implements HandleCommand {

    @Parameter({
        displayName: "Pull Request Number",
        description: "number of the pull request number to merge, with no leading `#`",
        pattern: /^.*$/,
        validInput: "an open Bitbucket pull request number",
        minLength: 1,
        maxLength: 10,
        required: true,
    })
    public pr: number;

    @Parameter({
        displayName: "Commit Title",
        pattern: /^.*$/,
        minLength: 0,
        maxLength: 100,
        required: false,
    })
    public title: string;

    @Parameter({
        displayName: "Commit Message",
        pattern: /[\s\S]*/,
        minLength: 0,
        maxLength: 1000,
        required: false,
    })
    public message: string;

    @Parameter({
        displayName: "SHA",
        pattern: /.*$/,
        required: true,
    })
    public sha: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public project: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const auth = getBitbucketAuth();
        const api = bitbucketApi(this.apiUrl, auth);
        if (await this.canMerge(this.project, this.repo, this.pr, api)) {
            return api.mergePR({project: this.project, repo: this.repo, pr: this.pr})
                .catch((err: any) => {
                return handleError("Merge Pull Request", err, ctx);
            })
                .then(() => Success, failure);
        } else {
            const text = `Pull request #${this.pr} can not` +
                ` be merged at this time. Please review the pull request for potential conflicts.`;
            return ctx.messageClient.respond(slackWarningMessage("Merge Pull Request", text, ctx));
        }
    }

    private async canMerge(project: string, repo: string, pr: number, api: BitbucketApi): Promise<boolean> {
        return (await api.canPRBeMerged({project, repo, pr})).result;
    }
}
