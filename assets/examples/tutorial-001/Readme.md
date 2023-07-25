# Custom pipeline hello world

This example shows how to create a custom pipeline.

In pipeline-001.ts we create a custom pipeline that will do basic forward rendering.

We need to register the pipeline in the engine before we can use it.

```typescript 
rendering.setCustomPipeline('MyPipeline', new HelloWorldPipeline());
```
