# Custom pipeline subpass in and out test

This example shows how to use subpass.

In subpassInOut.ts we create a custom pipeline that drawing solid color and compose them by subpass.

1. First write to 4 attachment respectively: {resource name: shader slot name} -> {`cOne`: `cFirst`}, {`cTwo`: `cSecond`}, {`cThree`: `cThird`}, {`cFour`: `cForth`};
2. Read `cOne` and `cTwo` then write to `cFive`;
3. Read `cThree` and `cFour`, read `cFive` then write to `cFive`;
4. Copy `cFive` to swapchain.

The `g`(or `y`) component of swapchain is 0.4, which comes from subpass 0, this validates the {`cFour`: `cForth`} won't be reordered in the front of  {`cTwo`: `cSecond`}, {`cThree`: `cThird`},; 

```typescript 
rendering.setCustomPipeline('SubpassInOut', new HelloWorldPipeline());
```
