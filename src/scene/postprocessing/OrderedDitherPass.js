import { ShaderMaterial, UniformsUtils, Vector3 } from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { OrderedDitherShader } from "./OrderedDitherShader.js";

/**
 * Post-processing pass adapted from
 * https://github.com/samwhitford/threejs-ordered-dithering-effect (MIT),
 * as used by Cartografías Imposibles / LENTES.
 */
export class OrderedDitherPass extends Pass {
  constructor(thresholdMapSize = 4, scale = 4) {
    super();

    const shader = OrderedDitherShader;
    this.uniforms = UniformsUtils.clone(shader.uniforms);
    this.uniforms.thresholdMapSize.value = thresholdMapSize;
    this.uniforms.scale.value = scale;
    this.uniforms.amount.value = 1;
    this.uniforms.saturate.value = 1;
    this.uniforms.crush.value = 0;
    this.uniforms.table.value = new Vector3(0, 0, 0);

    this.material = new ShaderMaterial({
      name: shader.name,
      uniforms: this.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });

    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.fsQuad.render(renderer);
    }
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
