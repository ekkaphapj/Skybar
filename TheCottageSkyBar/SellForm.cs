using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;
using System.Drawing.Printing;
using System.IO;

namespace TheCottageSkyBar
{
    public partial class SellForm : Form
    {
        public SellForm(string _cusName)
        {
            InitializeComponent();
            cusNamePublic = _cusName;
        }

        string billid;
        string cusNamePublic = "";
        private void button2_Click(object sender, EventArgs e)
        {
            if (totalitem != 0)
            {
                DialogResult dialogResult = MessageBox.Show("ยังไม่ได้บันทึกการขาย ต้องการจะปิดใช่หรือไม่", "ยังไม่บันทึกการขาย", MessageBoxButtons.YesNo);
                if (dialogResult == DialogResult.Yes)
                {
                    this.Close();
                }
                else if (dialogResult == DialogResult.No)
                {

                }


            }
            else
                this.Close();
           
        }

        private void button1_Click(object sender, EventArgs e)
        {

            if (comboBox5.SelectedIndex != -1)
            {
                totalprice = 0;
                totalitem = 0;
                label10.Text = "";
                textBox5.Text = "";
                textBox7.ReadOnly = false;
                clearAllListbox();
                comboBox1.Visible = true;
                textBox1.Visible = true;
                listBoxList.Items.Clear();
                if (textBox1.Text == "")
                {
                    billid = DateTime.Now.Hour.ToString() + DateTime.Now.Minute.ToString() + DateTime.Now.Second.ToString() + DateTime.Now.Day.ToString() + DateTime.Now.Month.ToString() + DateTime.Now.Year.ToString();
                    textBox1.Text = billid;
                }
                this.ActiveControl = textBox7;
            }
            else
            {
                MessageBox.Show("เลือกผู้ขายก่อน");

            }
        }

        private void SellForm_Load(object sender, EventArgs e)
        {
            loadItemType();
            comboBox3.SelectedIndex = 0;
            if (isSkybar())
            {
                label25.Text = "THE COTTAGE SKY BAR";
                label26.Text = "ลูกค้า: " + cusNamePublic;
                this.Text = cusNamePublic;
                comboBox6.Visible = true;
                comboBox6.SelectedIndex = 0;
                button9.Visible = true;
            }
            else
            {
                label25.Text = "THE COTTAGE MINI MART";
                label26.Text = "ลูกค้า: " + cusNamePublic;
                button9.Visible = false;
            }

        }

        private bool isSkybar()
        {
            if (Form1.shoptype == 0)
                return true;
            else
                return false;
        }

        private void loadItemType()
        {
            comboBox1.Items.Clear();
            string strSQL = "SELECT ItemType.Name1 FROM ItemType;";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                comboBox1.Items.Add(reader["Name1"].ToString());

            reader.Close();
            connection.Close();
        }


        private void loadItemList()
        {
            comboBox2.Items.Clear();
           
            try {
                string strSQL = "SELECT Items.Name1 FROM Items INNER JOIN ItemType ON Items.ItemTypeID = ItemType.ID where ItemType.Name1='" + comboBox1.SelectedItem.ToString() + "';";
                OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
                OleDbCommand command = new OleDbCommand(strSQL, connection);
                connection.Open();
                OleDbDataReader reader = command.ExecuteReader();
                while (reader.Read())
                    comboBox2.Items.Add(reader["Name1"].ToString());

                reader.Close();
                connection.Close();
                comboBox2.Text = "";

            }
            catch (Exception)
            {
                //MessageBox.Show("โหลดข้อมูลผิดพลาด กรุณาลองใหม่");
            }
        }


        private void loadItemPriceAndTotal()
        {

            textBox2.Text = "";
            textBox6.Text = "";
            textBox7.Text = "";
            string _price = "0";
            string _total = "0";
            string _itemid = "0";
            string strSQL = "SELECT Items.ID,Items.Price, Stock.Amount FROM Stock INNER JOIN Items ON Stock.ItemID = Items.ID where Items.Name1='"+comboBox2.SelectedItem.ToString()+"';";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                _price = reader["Price"].ToString();
                _total = reader["Amount"].ToString();
                _itemid = reader["ID"].ToString();
            }

            reader.Close();
            connection.Close();
            textBox2.Text = _price;
            textBox6.Text = _total;
            textBox7.Text = _itemid;
            calculatePrice();
        }


        private void calculatePrice()
        {
            try
            {
                if (textBox2.Text != "")
                {
                    textBox3.Text = (Convert.ToInt16(comboBox3.SelectedItem.ToString()) * Convert.ToDouble(textBox2.Text)).ToString("0.00");
                }
            }
            catch (Exception)
            {
                MessageBox.Show("ราคาไม่ถูกต้อง");
            }
        }

        private void comboBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            loadItemList();
            textBox2.Text = "";
            textBox6.Text = "";
            textBox3.Text = "";
            textBox7.Text = "";
          
            comboBox2.SelectedItem = null;
        }

        private void button4_Click(object sender, EventArgs e)
        {
            reset(); 
        }

        private void reset()
        {
            isPaid = 0;
            roomNo = 0;
            cusName = "";
            comboBox1.Visible = false;
            textBox1.Text = "";
            textBox1.Visible = false;
           // comboBox1.Items.Clear();
            comboBox2.Items.Clear();
            comboBox1.SelectedIndex = -1;
            comboBox3.SelectedIndex = 0;
            comboBox4.SelectedIndex = -1;
            comboBox2.SelectedIndex = -1;
            textBox2.Text = "";
            textBox3.Text = "";
            textBox4.Text = "";
            textBox5.Text = "";
            textBox7.Text = "";
            textBox9.Text = "";
            textBox9.ReadOnly = true;
            textBox10.Text = "";
            textBox11.Text = "";
            textBox12.Text = "";
            textBox7.Text = "";
            textBox7.ReadOnly = true;
            textBox8.Text = "";
            label24.Text = "ชื่อลูกค้า";
            totalitem = 0;
            paidbyVoucher = 0;
           clearAllListbox();

        }

        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
           // comboBox3.SelectedIndex = 0;
            textBox3.Text = "";
            loadItemPriceAndTotal();
        }

        private void comboBox3_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (textBox2.Text!="")
            {
                textBox3.Text = (Convert.ToInt16(comboBox3.SelectedItem.ToString()) * Convert.ToDouble(textBox2.Text)).ToString("0.00");
            }
        }

        double totalprice = 0;
        int totalitem = 0;
        private void button3_Click(object sender, EventArgs e)
        {
            addSellItem();
        }

        double totalpriceBeforeDiscount = 0;    
        private void addSellItem()
        {
            if (textBox3.Text != "")
            {
                if (comboBox3.SelectedItem != null)
                {
                    if (comboBox1.SelectedItem.ToString() == "ส่วนลด")
                    {
                        totalpriceBeforeDiscount = totalprice;
                        listBoxID.Items.Add(textBox7.Text);
                        listBoxList.Items.Add(comboBox2.SelectedItem.ToString());
                        listBoxAmount.Items.Add(comboBox3.SelectedItem.ToString());
                        int _discount =(int) (totalprice * (1-Convert.ToDouble(textBox3.Text)));
                        totalprice = totalprice - _discount;
                        listBoxPrice.Items.Add("-" + _discount.ToString());
                        textBox5.Text = totalprice.ToString();
                        totalitem++;
                        label10.Text = "จำนวน " + totalitem.ToString() + " รายการ";
                        comboBox3.SelectedIndex = 0;
                        clearItemType();
                        this.ActiveControl = textBox7;
                    }
                    else
                    {
                        listBoxID.Items.Add(textBox7.Text);
                        listBoxList.Items.Add(comboBox2.SelectedItem.ToString());
                        listBoxAmount.Items.Add(comboBox3.SelectedItem.ToString());
                        listBoxPrice.Items.Add(textBox3.Text);
                        totalprice = totalprice + Convert.ToDouble(textBox3.Text);
                        textBox5.Text = totalprice.ToString();
                        totalitem++;
                        label10.Text = "จำนวน " + totalitem.ToString() + " รายการ";
                        comboBox3.SelectedIndex = 0;
                        clearItemType();
                        this.ActiveControl = textBox7;
                    }
                }
                else
                {
                    MessageBox.Show("กรุณาเลือกจำนวนสินค้าจากในช่องเท่านั้น");
                    comboBox3.SelectedIndex = 0;
                }

            }
        }
         
        private void listBox3_SelectedIndexChanged(object sender, EventArgs e)
        {

        }

        private void clearAllListbox()
        {
            listBoxID.Items.Clear();
            listBoxList.Items.Clear();
            listBoxPrice.Items.Clear();
            listBoxAmount.Items.Clear();
        }

        private void clearItemType()
        {
            comboBox1.SelectedIndex = -1;
        }

        private void listBoxList_SelectedIndexChanged(object sender, EventArgs e)
        {

        }

        private void listBoxList_DoubleClick(object sender, EventArgs e)
        {
            textBox4.Text = listBoxList.SelectedItem.ToString();
            textBox8.Text = listBoxList.SelectedIndex.ToString();
        }

        private void button5_Click(object sender, EventArgs e)
        {
            
            if (textBox4.Text!="")
            {
                if (textBox8.Text!="")
                {
                    int _index = Convert.ToInt16(textBox8.Text);

                    totalprice = totalprice - Convert.ToDouble(listBoxPrice.Items[_index].ToString());
                    textBox5.Text = totalprice.ToString();
                    totalitem--;
                    label10.Text = "จำนวน " + totalitem.ToString() + " รายการ";
                    deleteItem(_index);
                    textBox4.Text = "";
                    textBox8.Text = "";

                }
            }
        }

        private void deleteItem(int _index)
        {
            listBoxAmount.Items.RemoveAt(_index);
            listBoxList.Items.RemoveAt(_index);
            listBoxID.Items.RemoveAt(_index);
            listBoxPrice.Items.RemoveAt(_index);
        }

        private void textBox7_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                getItemDetail();
            }
        }


        private void getItemDetail()
        {
            string _itemtype = "";
            string _item = "";
            string _price = "";
            string _itemremain = "";
            string strSQL = "SELECT ItemType.Name1 AS Type1, Items.Name1 as ItemName, Items.Price as Price1, Stock.Amount as Amount1 FROM (ItemType INNER JOIN Items ON ItemType.ID = Items.ItemTypeID) INNER JOIN Stock ON Items.ID =Stock.ItemID WHERE Items.ID='"+textBox7.Text+"';";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                _itemtype = reader["Type1"].ToString();
                _item = reader["ItemName"].ToString();
                _price = reader["Price1"].ToString();
                _itemremain = reader["Amount1"].ToString();
            }
            reader.Close();
            connection.Close();

            comboBox1.SelectedItem = _itemtype;
            comboBox2.SelectedItem = _item;
            textBox2.Text = _price;
            textBox6.Text = _itemremain;
            try
            {
                textBox3.Text = (Convert.ToInt16(comboBox3.SelectedItem.ToString()) * Convert.ToDouble(textBox2.Text)).ToString("0.00");
                addSellItem();
            }
            catch (Exception)
            {
                MessageBox.Show("ไม่พบสินค้า หรือรหัสสินค้าไม่ถูกต้อง");
                textBox7.Text = "";
                this.ActiveControl = textBox7;
            }
            
        }

        private void button7_Click(object sender, EventArgs e)
        {
            if (textBox1.Text!="")
            {
                textBox7.Text = "";
                this.ActiveControl = textBox7;
            }
            else
            {
                MessageBox.Show("ต้องเปิดการขายก่อน");
            }
        }

        private void comboBox4_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (comboBox4.SelectedIndex==0) //Cash
            {
                textBox9.Text = "";
                paidbyVoucher = 0;
                textBox9.ReadOnly = false;
                button10.Visible = false;
                label27.Visible = false;
                textBox5.Text = totalprice.ToString();
                this.ActiveControl = textBox9;
            }
            else if (comboBox4.SelectedIndex==3) //Voucher
            {
                label27.Visible = true;
                button10.Visible = true;
                paidbyVoucher = 1;
                textBox9.ReadOnly = false;
                this.ActiveControl = textBox9;
            }
            else
            {
                textBox9.Text = "";
                textBox10.Text = "";
                paidbyVoucher = 0;
                textBox5.Text = totalprice.ToString();
                textBox9.ReadOnly = true;
                label27.Visible = false;
                button10.Visible = false;
                textBox9.ReadOnly = true;
            }
        }

        private void textBox9_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                textBox10.Text = (Convert.ToDouble(textBox9.Text) - Convert.ToDouble(textBox5.Text)).ToString("0.00");
            }
        }

        private void button6_Click(object sender, EventArgs e)
        {
            if (validatorSell())
            {
                SaveSellTransaction();
            }
        }

        string[,] itemList;
        int paidbyVoucher = 0;
        private void SaveSellTransaction()
        {
            if (paidbyVoucher == 0)
            {
                int _i = 0;
                string _itemID = "";
                int _amount = 0;
                double _price = 0;
                while (_i < totalitem)
                {
                    _itemID = listBoxID.Items[_i].ToString();
                    _amount = Convert.ToInt16(listBoxAmount.Items[_i].ToString());
                    _price = Convert.ToDouble(listBoxPrice.Items[_i].ToString());
                    insertSellTransaction(_itemID, _amount, _price);
                    insertStockTransaction(_itemID, _amount, _price);
                    updateStockFromSell(_itemID, _amount);
                    _i++;
                }
                addDataToArray();
                inserttoAccount();
                MessageBox.Show("บันทึกรายการขายเรียบร้อย");
                if (comboBox4.SelectedIndex == 0)
                {
                    insertCash();
                    MessageBox.Show("บันทึกรายการเงินสดเรียบร้อย");
                }
                isPaid = 1;
                if (isSkybar())
                    printReceipt();
                reset();
            }
            else // Paid by Voucher
            {
                //insertSellTransaction(_itemID, _amount, _price);
                insertSellTransaction(listBoxID.Items[0].ToString(),1,0);
                insertStockTransaction(listBoxID.Items[0].ToString(), 1, 0);
                updateStockFromSell(listBoxID.Items[0].ToString(), 1);
                inserttoAccount();
                updateVoucher(textBox9.Text);
                MessageBox.Show("บันทึกรายการขายเรียบร้อย");
              //  if (isSkybar())
                //    printReceipt();
                reset();
            }
        }

        private bool validateUsingVoucher()
        {
            if (totalitem > 1)
            {
                MessageBox.Show("ใช้ Voucher ได้ทีละรายการเท่านั้น");
                return false;
            }
            if (textBox5.Text=="")
            {
                MessageBox.Show("เลือกสินค้าที่จะขาย");
                return false;
            }
            if (Convert.ToInt32(textBox5.Text)>30)
            {
                MessageBox.Show("ใช้ได้กับเครื่องดื่มไม่มีแอลกอฮอล์เท่านั้น");
                return false;
            }
            if (textBox5.Text != "")
            {
                if (Convert.ToDouble(textBox5.Text)>31)
                {
                    MessageBox.Show("ไม่สามารถใช้ได้ เนื่องจากราคาเกินกำหนด");
                    return false;
                }
            }
          

            return true;
        }

        private void addDataToArray()
        {
            itemList = new string[totalitem, 3];
            int _i = 0;
            while (_i < totalitem)
            {
                itemList[_i, 0] = listBoxList.Items[_i].ToString();
                itemList[_i, 1] = listBoxAmount.Items[_i].ToString();

                itemList[_i, 2] = Convert.ToDouble( listBoxPrice.Items[_i].ToString()).ToString("0.0");
                _i++;
            }
        }

        private void printReceipt()
        {
            try
            {
                PrintDocument pd = new PrintDocument();
                PrinterSettings ps = new PrinterSettings();
                pd.PrintPage += new PrintPageEventHandler(this.pd_PrintPage);
                pd.Print();
                
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message);
            }
        }
      

        private bool validatorSell()
        {
            if (textBox11.Text!="")
            {
                try
                {
                    roomNo = Convert.ToInt16(textBox11.Text);
                    
                }
                catch (Exception)
                {
                    roomNo = 0;
                    MessageBox.Show("ใส่เลขห้องพักไม่ถูกต้อง");
                    return false;
                }
            }
            if (textBox12.Text!="")
            {
                cusName = textBox12.Text;
            }
            if (totalitem<1)
            {
                MessageBox.Show("ไม่มีรายการสินค้า");
                return false;

            }
            try
            {
                Convert.ToDouble(textBox5.Text);
            }
            catch (Exception)
            {
                MessageBox.Show("ราคารวมไม่ถูกต้อง");
                return false;
            }
            if (comboBox4.SelectedIndex==-1)
            {
                MessageBox.Show("เลือกวิธีการชำระเงิน");
                return false;
            }

            if (comboBox4.SelectedIndex==0)
            {
                try
                {
                    Convert.ToDouble(textBox9.Text);
                }
                catch (Exception)
                {
                    MessageBox.Show("ใส่จำนวนเงินที่รับมาไม่ถูกต้อง");
                    return false;
                }
            }

            if (comboBox4.SelectedIndex==3)
            {
                label27.Visible = true;
            }

            return true;
        }



        int roomNo = 0;
        string cusName = "";
        private bool insertSellTransaction(string itemID,int amount,double price)
        {

            string _itemTypeID = (comboBox1.SelectedIndex + 1).ToString();
            string strProvider = Form1.connStringMain;
            int _success = 0;
            string strSQL = "INSERT INTO SELL(DATE1,TIME1,ItemID,Amount,Price,PaymentType,OrderID,Owner,RoomNo,Cusname) VALUES(#"+getDateTime( DateTime.Now.ToShortDateString())+"#,#"+DateTime.Now.ToShortTimeString()+"#,'"+itemID+"',"+amount+","+price+",'"+comboBox4.SelectedItem.ToString()+"','"+textBox1.Text+"','"+comboBox5.SelectedItem.ToString()+"',"+roomNo+",'"+cusName+"');";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();
            connection.Close();

            if (_success != 0)
                return true;
            else
                return false;
        }

        private bool insertStockTransaction(string itemID, int amount, double price)
        {
            string strProvider = Form1.connStringMain;
            int _success = 0;
            string strSQL = "INSERT INTO StockTransaction(TransactionType,Amount,Price,DateRecord,Date2,Place,ItemID,PaymentType,Owner,BillID)  VALUES('ขาย'," + amount + "," + price + ",#" + getDateTime( DateTime.Now.ToShortDateString()) + "#,#" + getDateTime( DateTime.Now.ToShortTimeString()) + "#,'ร้าน','" + itemID + "','" + comboBox4.SelectedItem.ToString() + "','" + comboBox5.SelectedItem.ToString() + "','" + textBox1.Text + "');";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();


            connection.Close();
            if (_success != 0)
                return true;
            else
                return false;

        }

        private string getDateTime(string date)
        {
            int _beforenextday = 0;
            string dateNewFormat = Convert.ToDateTime(date).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture);
            _beforenextday = DateTime.Compare(DateTime.Now, Convert.ToDateTime(DateTime.Now.ToShortDateString() + " 02:00"));
            DateTime d1 = Convert.ToDateTime(dateNewFormat, System.Globalization.CultureInfo.InvariantCulture);
            if (_beforenextday==-1)
            {
                dateNewFormat= d1.AddDays(-1).ToShortDateString();
            }
          
            return dateNewFormat;

        }

        private void updateStockFromSell(string itemID,int amount)
        {
            string strProvider = Form1.connStringMain;
            int _amount = 0;
            string strSQL = "select amount from stock where itemID='"+itemID+"';";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                _amount = Convert.ToInt32( (reader["amount"].ToString()));

            reader.Close();

            amount = _amount - amount;


            strSQL = "UPDATE Stock SET Amount="+amount+",Date1=#"+DateTime.Now.ToShortDateString()+"#,Time1=#"+DateTime.Now.ToShortTimeString()+"#  WHERE ItemID='"+itemID+"';";
            command = new OleDbCommand(strSQL, connection);
            command.ExecuteNonQuery();
            connection.Close();
        }


        string list = "";
        private void inserttoAccount()
        {
             if (paidbyVoucher==1)
            {
                list = "รายการใช้ Voucher หมายเลข "+textBox9.Text +" เป็นเงิน " + totalprice.ToString() + " บาท หมายเลขบิล " + textBox1.Text;
            }
             else
                list = "รายการขายสินค้า จำนวน " + totalitem.ToString() + " รายการ เป็นเงิน " + totalprice.ToString() + " บาท หมายเลขบิล " + textBox1.Text;
            string strProvider = Form1.connStringMain;
            string strSQL = "INSERT INTO Account(Date1,Time1,PaymentType,Amount,Type,BillID,Owner,List) VALUES(#"+getDateTime( DateTime.Now.ToShortDateString())+"#,#"+DateTime.Now.ToShortTimeString()+"#,'"+comboBox4.SelectedItem.ToString()+"',"+textBox5.Text+",'รายรับ','"+textBox1.Text+"','"+comboBox5.SelectedItem.ToString()+"','"+list+"')";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            command.ExecuteNonQuery();
            connection.Close();
        }

        private void insertCash()
        {

            string _acctid = "";
            string strSQL = "SELECT MAX(ID) AS ACCTID FROM ACCOUNT";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                _acctid = reader["ACCTID"].ToString();
            reader.Close();

            strSQL = "INSERT INTO CASH(DATE1,TYPE1,LIST,TIME1,AMOUNT,ACCOUNTID) VALUES(#" +getDateTime( DateTime.Now.ToShortDateString()) + "#,'รายรับ','" + list + "',#" + DateTime.Now.ToShortTimeString() + "#," + textBox5.Text + "," + _acctid + ")";
            command = new OleDbCommand(strSQL, connection);
            command.ExecuteNonQuery();
            connection.Close();
        }




        private void button8_Click(object sender, EventArgs e)
        {

        }

        private bool isVoucherAvailable()
        {
            int _isexist = 0;
            if (checkVoucherDBExist())
            {

                if (textBox9.Text != "")
                {
                    string strSQL = "SELECT COUNT(ID) as isFound FROM VOUCHER WHERE DATE1=#" + getDateTime(DateTime.Now.ToShortDateString()) + "# AND ID=" + textBox9.Text + " and Status=0";
                    OleDbConnection connection = new OleDbConnection(Form1.VoucherconnStringMain);
                    OleDbCommand command = new OleDbCommand(strSQL, connection);
                    connection.Open();
                    OleDbDataReader reader = command.ExecuteReader();
                    while (reader.Read())
                    {
                        try
                        {
                            _isexist = Convert.ToInt16(reader["isFound"].ToString());
                        }
                        catch (Exception)
                        {

                        }
                    }
                    reader.Close();
                    connection.Close();
                }
                else
                    MessageBox.Show("ใส่รหัส Voucher");
            }
            if (_isexist !=0)
                return true;
            else
                return false;
        }

        private bool checkVoucherDBExist()
        {
            if (File.Exists(Form1.VoucherDBFile))
            {
                return true;
            }
            return false;
        }


        int isPaid = 0;
        private void pd_PrintPage(object sender, PrintPageEventArgs ev)
        {
            System.Drawing.Font headingFont = new System.Drawing.Font("Calibri", 11, System.Drawing.FontStyle.Bold);
            System.Drawing.Font boldFont = new System.Drawing.Font("Calibri", 9, System.Drawing.FontStyle.Bold);
            System.Drawing.Font normalFont = new System.Drawing.Font("Calibri", 9, System.Drawing.FontStyle.Regular);
            float topMargin = ev.MarginBounds.Top;
            float leftMargin = ev.MarginBounds.Left;

           
            float height = 30;
         
                ev.Graphics.DrawString("THE COTTAGE SKY BAR", headingFont, Brushes.Black, 25, height, new StringFormat()); height += 30;
                ev.Graphics.DrawString("@ The Cottage Hotel Udon Thani", normalFont, Brushes.Black, 10, height, new StringFormat());
                height += 40;
                ev.Graphics.DrawString("-------------------------------------------------", normalFont, Brushes.Black, 5, height, new StringFormat());
                height += 20;

                ev.Graphics.DrawString("RECEIPT/ใบเสร็จ", headingFont, Brushes.Black, 40, 115, new StringFormat());
                ev.Graphics.DrawString("ID: " + textBox1.Text, normalFont, Brushes.Black, 7, 140, new StringFormat());
                ev.Graphics.DrawString("Date: " + DateTime.Now.ToString(), normalFont, Brushes.Black, 7, 155, new StringFormat());
            if (isPaid == 1)
            {
                if (paidbyVoucher == 0)
                {
                    ev.Graphics.DrawString("ชำระโดย: " + comboBox4.SelectedItem.ToString(), normalFont, Brushes.Black, 7, 173, new StringFormat());
                    height = 215;
                }
                else
                {
                    ev.Graphics.DrawString("ชำระโดย: Voucher หมายเลข " + textBox9.Text, normalFont, Brushes.Black, 7, 173, new StringFormat());
                    height = 215;
                }
            }

            else
                height = 195;

                //Printe Table Headings
                ev.Graphics.DrawString("List", normalFont, Brushes.Black, 7, height, new StringFormat());
                ev.Graphics.DrawString("Qty", normalFont, Brushes.Black, 120, height, new StringFormat());
                ev.Graphics.DrawString("Price", normalFont, Brushes.Black, 150, height, new StringFormat());
                ev.Graphics.DrawString("-------------------------------------------------", normalFont, Brushes.Black, 5, height + 10, new StringFormat());
                height = height + 10;

            //Print Item
            for (int i = 0; i < totalitem; i++)
            {
                height = height + 15;
                ev.Graphics.DrawString(itemList[i, 0], normalFont, Brushes.Black, 7, height , new StringFormat());
                ev.Graphics.DrawString(itemList[i, 1], normalFont, Brushes.Black, 125, height, new StringFormat());
                ev.Graphics.DrawString(itemList[i, 2], normalFont, Brushes.Black, 150, height, new StringFormat());             
            }
          
            //Line
            height = height + 30;
            ev.Graphics.DrawString("-------------------------------------------------", normalFont, Brushes.Black, 5, height + 15, new StringFormat());
                height = height + 20;

                //Total
                ev.Graphics.DrawString("รวม/Total : " + textBox5.Text + " บาท", headingFont, Brushes.Black, 5, height + 20, new StringFormat());
                ev.Graphics.DrawString("-------------------------------------------------", normalFont, Brushes.Black, 5, height + 35, new StringFormat());
                if (isPaid==0)
                ev.Graphics.DrawString("ขอบคุณค่ะ / THANK YOU", headingFont, Brushes.Black, 15, height + 65, new StringFormat());
                else
                ev.Graphics.DrawString("ชำระแล้ว", headingFont, Brushes.Black, 50, height + 65, new StringFormat());


            ev.HasMorePages = false;
        }

        private void button9_Click(object sender, EventArgs e)
        {
            if (isSkybar())
            {
                if (textBox1.Text != "")
                {
                    if (textBox5.Text != "")
                    {
                        if (totalitem > 0)
                        {
                            isPaid = 0;
                            addDataToArray();
                            printReceipt();
                        }
                    }
                }
                else
                    MessageBox.Show("ปริ๊นได้เฉพาะร้าน Sky bar");

            }
        }

        private void button10_Click(object sender, EventArgs e)
        {
            if (isVoucherAvailable())
            {
                if (validateUsingVoucher())
                {
                    MessageBox.Show("คูปองใช้ได้");
                    paidbyVoucher = 1;
                    textBox5.Text = "0";
                    textBox5.ReadOnly = true;
                }
                
            }
            else
                MessageBox.Show("คูปองไม่สามารถใช้ได้");
        }

        private void updateVoucher(string voucherID)
        {
            int _success = 0;
            string strProvider = Form1.VoucherconnStringMain;
            string strSQL = "update Voucher set Status=1 where ID="+voucherID;
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();


            connection.Close();
            if (_success == 0)
                MessageBox.Show("update สถานะ Voucher ไม่สำเร็จ");
        }

        double priceBeforeDiscount = 0;
        private void comboBox6_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (textBox5.Text!="")
            {
                if (totalprice!=0)
                {
                  /*  priceAfterDiscount = totalprice;
                    if (comboBox6.SelectedIndex==1)
                    {
                        totalprice = totalprice * 0.95;
                        textBox3
                    }*/
                }
            }
        }
    }
}
