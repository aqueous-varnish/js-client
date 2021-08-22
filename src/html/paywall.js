export default `
<style>
@import url('https://rsms.me/inter/inter.css');
@supports (font-variation-settings: normal) {
  .AQVSPaywall--modal {
    font-family: 'Inter var', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .AQVSPaywall--pay-button {
    font-family: 'Inter var', -apple-system, BlinkMacSystemFont, sans-serif;
  }
}
.AQVSPaywall--modal {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  all: initial;
  box-sizing: border-box;
  position: fixed;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transform: scale(1.1);
  transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
  z-index: 100001 !important;
}
.AQVSPaywall--modal-content {
  box-shadow: 0 5px 30px 0px rgb(53 53 53 / 50%);
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 10px;
  background: rgb(245, 245, 245);
  overflow: hidden;
  width: 385px;
  border-radius: 0.5rem;
}
@media screen and (max-width: 385px) {
  .AQVSPaywall--modal-content {
    width: 100%;
    border-radius: 0;
    height: 100vh;
    transform: unset;
    top: unset;
    left: unset;
  }
}

.AQVSPaywall--top {
  display: flex;
  position: relative;
  justify-content: space-between;
}
.AQVSPaywall--close {
  margin-top: 2px;
  width: 14px;
  height: 14px;
  background: rgb(53,53,53);
  border-radius: 999px;
  padding: 0;
  font: inherit;
  outline: inherit;
  cursor: pointer;
  border: none;
}
.AQVSPaywall--show-modal {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
  transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;
}
.AQVSPaywall--preview {
  border-radius: 6px;
  max-width: 100px;
  text-align: center;
  margin-bottom: 32px;
}
.AQVSPaywall--name {
  color: rgb(53, 53, 53);
  font-size: 36px;
  font-weight: 600;
}
.AQVSPaywall--top-banner {
  text-align: center;
  padding: 16px;
  padding-top: 16px;
  padding-bottom: 32px;
}
.AQVSPaywall--description {
  color: rgb(121, 121, 121);
  font-size: 16px;
  font-weight: 500;
}
.AQVSPaywall--eyebrow {
  color: rgb(121, 121, 121);
  font-size: 16px;
  font-weight: 500;
}
.AQVSPaywall--context {
  color: rgb(121, 121, 121);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 32px;
}
.AQVSPaywall--context img {
  max-width: 180px;
  max-height: 24px;
}
.AQVSPaywall--payment-details {
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 16px;
}
.AQVSPaywall--pay-button {
  cursor: pointer;
  border: 0;
  width: 100%;
  text-align: center;
  border-radius: 6px 6px 6px 6px;
  font-size: 16px;
  font-weight: 600;
  background-color: rgb(53, 53, 53);
  color: rgb(245, 245, 245);
  padding: 20px 0px;
  font-size: 22px;
  margin-bottom: 14px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
.AQVSPaywall--pay-button:disabled,
.AQVSPaywall--pay-button[disabled] {
  cursor: progress;
  opacity: 0.8;
}
.AQVSPaywall--footer-text {
  font-size: 12px;
  font-weight: normal;
  text-align: center;
  line-height: 16px;
  font-weight: 400;
  color: rgba(121, 121, 121,0.6);
}
.AQVSPaywall--display-none {
  display: none;
}
.AQVSPaywall--error {
  text-align: center;
  margin-bottom: 8px;
  border-radius: 6px;
  padding: 10px 0px;
  background: #ff6961;
  color: whitesmoke;
  font-weight: 500;
}
</style>
<div class="AQVSPaywall--modal">
  <div class="AQVSPaywall--modal-content">
    <div class="AQVSPaywall--top-banner">
      <div class="AQVSPaywall--info">
        <div class="AQVSPaywall--top">
          <div class="AQVSPaywall--context">
            <span class="AQVSPaywall--display-none"></span>
            <img src="" class="AQVSPaywall--display-none" />
          </div>
          <button class="AQVSPaywall--close"></button>
        </div>
        <img class="AQVSPaywall--preview" src="https://f4.bcbits.com/img/a0195171096_16.jpg" />
        <div class="AQVSPaywall--eyebrow">You're buying NFT access to</div>
        <div class="AQVSPaywall--name">Rainbow Chan</div>
        <div class="AQVSPaywall--description">Spacings</div>
      </div>
    </div>
    <div class="AQVSPaywall--payment-details">
      <div class="AQVSPaywall--error"></div>

      <button class="AQVSPaywall--pay-button">Pay <span class="AQVSPaywall--eth-price">1.63</span> ETH</button>
      <div class="footer AQVSPaywall--footer-text">
        Powered by
        <a class="AQVSPaywall--footer-text" href="https://www.aqueousvarni.sh" target="_blank">aqueous varnish</a>
      </div>
    </div>
  </div>
</div>
`;
