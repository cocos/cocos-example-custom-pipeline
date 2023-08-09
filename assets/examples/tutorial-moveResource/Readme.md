# Custom pipeline move resource test

This example shows how to use move test.

In moveResourceTest.ts we create a custom pipeline that will do basic forward rendering with move pass involved.

1. first we rendering scene to 6 different texture;
2. next we move 6 textures produced in step 1 to two 3-slice texture respectively, and then move two 3-slice texture to a 6-slice texture;
3. sample from 6 slice texture and render to final target.

```typescript 
rendering.setCustomPipeline('MyPipeline', new HelloWorldPipeline());
```
