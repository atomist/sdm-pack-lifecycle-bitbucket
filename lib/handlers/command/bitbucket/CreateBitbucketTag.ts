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
import { slackSuccessMessage } from "@atomist/sdm";
import {
    codeLine,
} from "@atomist/slack-messages";
import {
    bitbucketApi,
    getBitbucketAuth,
    handleError,
} from "./bitbucketApi";

@ConfigurableCommandHandler("Create a tag on GitHub", {
    intent: [ "create bitbucket tag" ],
    autoSubmit: true,
})
@Tags("bitbucket", "tag")
export class CreateBitbucketTag implements HandleCommand {

    @Parameter({
        displayName: "Tag",
        description: "tag to create",
        pattern: /^\w(?:[-.\w/]*\w)*$/,
        validInput: "valid git tag, starting and ending with a alphanumeric character and containing alphanumeric,"
        + "_, -, ., and / characters",
        minLength: 1,
        maxLength: 100,
    })
    public tag: string;

    @Parameter({
        displayName: "SHA",
        description: "commit SHA to create tag on",
        pattern: /^[a-f0-9]+$/,
        validInput: "",
        minLength: 7,
        maxLength: 40,
    })
    public sha: string;

    @Parameter({
        displayName: "Message",
        description: "message for the annotated tag",
        pattern: /^.*$/,
        validInput: "arbitrary string",
        minLength: 0,
        maxLength: 200,
        required: false,
    })
    public message: string = "";

    @Parameter({ required: false, displayable: false })
    public msgId: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        const tagger = {
            name: "Atomist Bot",
            email: "bot@atomist.com",
            date: new Date().toISOString(),
        };
        const auth = getBitbucketAuth();

        return bitbucketApi(this.apiUrl, auth).createTag({
                project: this.owner,
                repo: this.repo,
                tagName: this.tag,
                message: this.message || "Tag created by Atomist Lifecycle Automation",
                sha: this.sha,
            })
            .then(() => {
                if (this.msgId) {
                    return ctx.messageClient.respond(slackSuccessMessage(
                        "Create Tag",
                        `Successfully created new tag ${codeLine(this.tag)} on commit ${
                            codeLine(this.sha.slice(0, 7))}`),
                        { id: this.msgId });
                }
                return undefined;
            })
            .then(() => Success)
            .catch((err: any) => {
                return handleError("Create Tag", err, ctx);
            });
    }
}
