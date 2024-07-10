import { Stack, StackProps, Duration, RemovalPolicy, aws_secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock, pinecone} from "@cdklabs/generative-ai-cdk-constructs";
import * as uuid from "uuid";


interface KnowledgeBaseAgentStackProps extends StackProps {}


/**
 * Knowledge Base を作成するためのリソースを作成する
 */
export class KnowledgeBaseAgentStack extends Stack {
    constructor(scope: Construct, id: string, props?: KnowledgeBaseAgentStackProps) {
        super(scope, id, props);

        // S3DataSource
        // The code that defines your stack goes here
        const docsBucket = new s3.Bucket(this, "docsbucket-" + uuid.v4(), {
            lifecycleRules: [{
            expiration: Duration.days(10),
            }],
            blockPublicAccess: {
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
            },
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        
        // ApiKeyの取得
        const vectorStoreSecret = aws_secretsmanager.Secret.fromSecretAttributes(this, "vectorstore_secret", {
            secretCompleteArn: `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:pinecone-kb-test-hclZGp`,
        });

        // secretFullArnがundefinedでないことを確認
        if (!vectorStoreSecret.secretFullArn) {
            throw new Error("Secret ARN is undefined");
        }

        const pineconeVectorStore = new pinecone.PineconeVectorStore({
            connectionString: "https://pinecone-kb-test-index-h7u1t19.svc.aped-4627-b74a.pinecone.io",
            credentialsSecretArn: vectorStoreSecret.secretFullArn,
            kmsKey: "aws/secretsmanager",
            textField: 'question',
            metadataField: 'metadata',
        });


        const docsKnowledgeBase = new bedrock.KnowledgeBase(this,"docsKnowledgeBase",{
              embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
              vectorStore: pineconeVectorStore,
              instruction: "knowledge base use this bucket to answer questions about research.It contains the full text of paper.",
        });

        const docsDataSource = new bedrock.S3DataSource(this,"docsDataSource",{
                bucket: docsBucket,
                knowledgeBase: docsKnowledgeBase,
                dataSourceName: "docs",
                chunkingStrategy: bedrock.ChunkingStrategy.FIXED_SIZE,
                maxTokens: 5000,
                overlapPercentage: 20,
        });
    }
}
