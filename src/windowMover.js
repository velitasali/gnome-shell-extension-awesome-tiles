import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import Meta from 'gi://Meta'

export class WindowMover {
  constructor() {
    this._windowAnimations = []
    this._desktopSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' })
  }

  destroy() {
    this._windowAnimations.forEach(animation=>{
      animation.clone?.destroy()
      const actor = animation.actor
      if (actor) {
        actor.timeline = null
      }
    })
    this._desktopSettings = this._windowAnimations = null
  }

  // capture window content and create clone clutter
  _captureWindow(window_actor,rect) {
    return new Clutter.Actor({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
      content: window_actor.paint_to_content(null)
    })
  }

  // unmaximize without animation by hacking gsettings
  _unmaximizeWithoutAnimation(window,rect) {
    rect ??= window.get_frame_rect()
    const lastValue = this._desktopSettings.get_boolean("enable-animations")
    if (lastValue) this._desktopSettings.set_boolean("enable-animations",false)
    window.unmaximize(Meta.MaximizeFlags.BOTH)
    window.move_resize_frame(false, rect.x, rect.y, rect.width, rect.height)
    if (lastValue) this._desktopSettings.set_boolean("enable-animations",true)
  }

  // give time to redraw it selfs to application
  _delayFrames(actor) {
    return new Promise(resolve=>{
      const timeline = actor.timeline = new Clutter.Timeline({ actor:actor,duration: 10000 })
      let count = 0
      timeline.connect("new-frame",()=>{
        if (++count<=5) return
        actor.timeline = null
        resolve()
      })
      timeline.start()
    })
  }

  _lerp(source,target,progress) {
    if (progress == 1) return target
    else if (progress == 0) return source
    return source + (target-source)*progress
  }

  _destroyAnimation(animation) {
    animation?.clone?.destroy()
    if (animation.timer) {
      if (animation.newFrameEvent) animation.timer.disconnect(animation.newFrameEvent)
      if (animation.completedEvent) animation.timer.disconnect(animation.completedEvent)
    }
    const index = this._windowAnimations.indexOf(animation)
    if (index != -1) this._windowAnimations.splice(index,1)
  }

  async _setWindowRect(window, x, y, width, height, animate) {
    const innerRectBefore = window.get_frame_rect()
    const outterRectBefore = window.get_buffer_rect()
    const actor = window.get_compositor_private()
    const isMaximized = window.get_maximized()
    const lastAnimation = this._windowAnimations.find(item=>item.window === window)
    const thisAnimation = {}
    let clone

    // unmaximize / reset all animations
    if (isMaximized) {
      clone = animate && this._captureWindow(actor,outterRectBefore)
      this._unmaximizeWithoutAnimation(window,innerRectBefore)
    }
    if (lastAnimation) this._destroyAnimation(lastAnimation)

    // clone window, and resize meta window
    thisAnimation.clone = animate && (clone ??= this._captureWindow(actor,outterRectBefore))
    thisAnimation.window = window
    thisAnimation.actor = actor
    window.move_resize_frame(false, x, y, width, height)
    if (!animate) {
      return
    }
    this._windowAnimations.push(thisAnimation)

    // Calculate before size / position
    const cloneGoalScaleX = width/innerRectBefore.width
    const cloneGoalScaleY = height/innerRectBefore.height
    const actorInitScaleX = innerRectBefore.width/width
    const actorInitScaleY = innerRectBefore.height/height
    const decoLeftBefore  = (innerRectBefore.x-outterRectBefore.x)
    const decoTopBefore   = (innerRectBefore.y-outterRectBefore.y)

    // draw clone, and wait for real window finish drawn
    global.window_group.insert_child_above(clone,actor)
    actor.visible = false
    await this._delayFrames(actor)
    if (this._windowAnimations.find(item=>item.window === window).clone != clone) {
      clone.destroy()
      return
    }
    actor.visible = true

    // Recalculate after size / position (required for real window)
    let innerRectAfter = window.get_frame_rect()
    let outterRectAfter = window.get_buffer_rect()
    let decoLeftAfter  = (innerRectAfter.x-outterRectAfter.x)
    let decoTopAfter   = (innerRectAfter.y-outterRectAfter.y)

    // Set real window actor position
    actor.scale_x = actorInitScaleX
    actor.scale_y = actorInitScaleY
    actor.x = innerRectBefore.x - decoLeftAfter*actorInitScaleX
    actor.y = innerRectBefore.y - decoTopAfter*actorInitScaleY

    // Clone animation
    clone.ease_property('opacity', 0, {
      duration: 300,
      mode: Clutter.AnimationMode.EASE_OUT_QUART
    })
    for (const prop of [
      [clone,'scale_x',cloneGoalScaleX],
      [clone,'scale_y',cloneGoalScaleY],
      [clone,'x',x-decoLeftBefore*cloneGoalScaleX],
      [clone,'y',y-decoTopBefore*cloneGoalScaleY]
    ]) {
      prop[0].ease_property(prop[1],prop[2],{
        duration: 300,
        mode: Clutter.AnimationMode.EASE_OUT_EXPO
      })
    }

    // Real window animation
    const timer = thisAnimation.timer = new Clutter.Timeline({
      actor: actor,
      duration: 300,
      progress_mode: Clutter.AnimationMode.EASE_OUT_EXPO,
    })
    thisAnimation.newFrameEvent = timer.connect('new-frame', ()=>{
      const progress = timer.get_progress()
      outterRectAfter = window.get_buffer_rect()
      decoLeftAfter  = (innerRectAfter.x-outterRectAfter.x)
      decoTopAfter   = (innerRectAfter.y-outterRectAfter.y)

      actor.x = this._lerp(
        innerRectBefore.x - decoLeftAfter*actorInitScaleX,
        x-decoLeftAfter,
        progress
      )
      actor.y = this._lerp(
        innerRectBefore.y - decoTopAfter*actorInitScaleY,
        y-decoTopAfter,
        progress
      )
      actor.scale_x = this._lerp(actorInitScaleX,1,progress)
      actor.scale_y = this._lerp(actorInitScaleY,1,progress)
    })
    thisAnimation.completedEvent = timer.connect('completed', ()=>{
      outterRectAfter = window.get_buffer_rect()
      actor.x = outterRectAfter.x
      actor.y = outterRectAfter.y
      actor.scale_y = actor.scale_x = 1

      const nowAnimation = this._windowAnimations.find(item=>item.window === window)
      if (nowAnimation && nowAnimation.clone === clone) this._destroyAnimation(nowAnimation)
    })
    timer.start()
  }
}
